package webtransport

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"git.baijiashilian.com/shared/brtc/webtransport-go/h3"
	"github.com/lucas-clemente/quic-go"
	"github.com/lucas-clemente/quic-go/quicvarint"
	"github.com/marten-seemann/qpack"
)

// Config for WebTransportServerQuic.
type ClientConfig struct {
	// remoteAddr sets an address to connect server.
	RemoteAddr string

	Certificates []tls.Certificate

	InsecureSkipVerify bool

	Path string

	HandshakeIdleTimeout time.Duration

	MaxIdleTimeout time.Duration

	KeepAlive bool
}

type WebTransportClient struct {
	ClientConfig
	connected bool
	sessionId uint64

	Stream chan quic.Stream

	// Incoming unidirectional HTTP/3 streams (e.g. WebTransport)
	ReceiveStream chan quic.ReceiveStream

	OnMessage func([]byte)

	OnClose func()

	session quic.Session

	connectStream quic.Stream

	settingsStream quic.ReceiveStream
}

func CreateWebTransportClient(config ClientConfig) *WebTransportClient {

	if config.HandshakeIdleTimeout <= 0 {
		config.HandshakeIdleTimeout = time.Duration(30 * time.Second)
	}
	if config.MaxIdleTimeout <= 0 {
		config.MaxIdleTimeout = time.Duration(10 * time.Minute)
	}

	return &WebTransportClient{
		ClientConfig:  config,
		connected:     false,
		sessionId:     0,
		Stream:        make(chan quic.Stream),
		ReceiveStream: make(chan quic.ReceiveStream),
	}
}

// connect client.
func (client *WebTransportClient) Connect() error {
	session, err := quic.DialAddr(
		client.RemoteAddr,
		&tls.Config{
			Certificates:       client.Certificates,
			InsecureSkipVerify: client.InsecureSkipVerify,
			NextProtos:         []string{"h3", "h3-32", "h3-31", "h3-30", "h3-29"},
		},
		&quic.Config{
			EnableDatagrams:      true,
			HandshakeIdleTimeout: client.HandshakeIdleTimeout,
			MaxIdleTimeout:       client.MaxIdleTimeout,
			KeepAlive:            client.KeepAlive,
		},
	)

	if err != nil {
		return err
	}

	client.session = session

	stream, err := session.AcceptUniStream(context.Background())
	if err != nil {
		return err
	}

	buf := make([]byte, 1)
	n, err := stream.Read(buf)
	if err != nil || n == 0 {
		log.Printf("data stream err: %v", err)
		return err
	}

	frame, err := h3.ParseNextFrame(stream)
	if err != nil {
		log.Printf("request stream ParseNextFrame err: %v", err)
		return err
	}

	settingsFrame, ok := frame.(*h3.SettingsFrame)
	if !ok {
		log.Println("server stream got not SettingsFrame")
		return errors.New("server stream got not SettingsFrame")
	}

	client.settingsStream = stream

	// 判断 server 是否支持 webtransport
	if settingsFrame.Other[H3_DATAGRAM_05] == 1 && settingsFrame.Other[ENABLE_WEBTRNASPORT] == 1 && settingsFrame.Other[ENABLE_CONNECT_PROTOCOL] == 1 {

		stream, err := session.OpenUniStreamSync(context.Background())
		if err != nil {
			log.Println("create settingStream failed")
			return err
		}

		// 发送Setting帧
		buf := &bytes.Buffer{}
		// stream type
		quicvarint.Write(buf, 0)
		(&h3.SettingsFrame{
			Datagram: true,
			Other: map[uint64]uint64{
				uint64(H3_DATAGRAM_05):          uint64(1),
				uint64(ENABLE_CONNECT_PROTOCOL): uint64(1),
				uint64(ENABLE_WEBTRNASPORT):     uint64(1),
			},
		}).Write(buf)
		stream.Write(buf.Bytes())

		requestStream, err := session.OpenStreamSync(context.Background())
		if err != nil {
			log.Println("create connectStream failed")
			return err
		}

		client.connectStream = requestStream

		requestWriter := h3.NewRequestWriter()

		err = requestWriter.WriteRequest(requestStream, &http.Request{
			Method: "CONNECT",
			Proto:  "webtransport",
			URL: &url.URL{
				Path:   client.Path,
				Scheme: "https",
			},
			Host:   client.RemoteAddr,
			Header: http.Header{},
			Body:   nil,
		}, false)
		if err != nil {
			log.Println("request frame failed")
			return err
		}

		resFrame, err := h3.ParseNextFrame(requestStream)
		if err != nil {
			log.Println("parse response frame failed")
			return err
		}

		hf, ok := resFrame.(*h3.HeadersFrame)
		if !ok {
			log.Println("expected first frame to be a HEADERS frame")
			return errors.New("server stream got not HeadersFrame")
		}
		headerBlock := make([]byte, hf.Length)
		if _, err := io.ReadFull(requestStream, headerBlock); err != nil {
			return err
		}
		decoder := qpack.NewDecoder(nil)
		hfs, err := decoder.DecodeFull(headerBlock)
		if err != nil {
			return err
		}

		res, err := h3.ResponseFromHeaders(hfs)
		if err != nil {
			log.Println("parse response failed")
			return err
		}

		if res.StatusCode == 200 {
			client.connected = true
			client.handleStream()
		} else {
			log.Println("request connect failed")
			return errors.New("request connect failed")
		}

		return nil
	} else {
		log.Println("server not support webtransport")
		return errors.New("server not support webtransport")
	}
}

func (client *WebTransportClient) handleStream() {
	go func() {
		for {
			stream, err := client.session.AcceptUniStream(client.session.Context())
			log.Printf("[AcceptUniStream]client accepted for streamId: %d", stream.StreamID())
			if err != nil {
				client.close()
				return
			}

			if stream.StreamID() == client.settingsStream.StreamID() {
				log.Printf("[AcceptUniStream]accepted settingsStream streamId: %d", stream.StreamID())
				continue
			}

			go func(stream quic.ReceiveStream) {
				br, ok := stream.(byteReader)
				if !ok {
					br = &byteReaderImpl{stream}
				}
				streamType, err := quicvarint.Read(br)
				if err != nil {
					return
				}
				sessionId, err := quicvarint.Read(br)
				if err != nil {
					return
				}

				if streamType == WebTransportUniStream {
					log.Printf("[AcceptUniStream]receiveStream accepted streamId: %d, sessionId: %d", stream.StreamID(), sessionId)
					client.ReceiveStream <- stream
				}

			}(stream)
		}
	}()

	go func() {
		for {
			stream, err := client.session.AcceptStream(client.session.Context())
			log.Printf("[AcceptStream]client accepted for streamId: %d", stream.StreamID())
			if err != nil {
				client.close()
				return
			}

			if stream.StreamID() == client.connectStream.StreamID() {
				log.Printf("[AcceptUniStream]accepted connectStream streamId: %d", stream.StreamID())
				continue
			}

			go func(stream quic.Stream) {
				br, ok := stream.(byteReader)
				if !ok {
					br = &byteReaderImpl{stream}
				}
				streamType, err := quicvarint.Read(br)
				if err != nil {
					return
				}
				sessionId, err := quicvarint.Read(br)
				if err != nil {
					return
				}

				if streamType == WebTransportStream {
					log.Printf("[AcceptStream]stream accepted streamId: %d, sessionId: %d", stream.StreamID(), sessionId)
					client.Stream <- stream
				}
			}(stream)
		}
	}()

	go func() {
		for {
			msg, err := client.session.ReceiveMessage()
			if err != nil {
				client.close()
				return
			}
			log.Printf("[webtransport_client]received message: %v", string(msg))

			if len(msg) > 0 {
				// TODO https://datatracker.ietf.org/doc/draft-ietf-webtrans-http3/ Session Termination 结束 session
				if client.OnMessage != nil {
					client.OnMessage(msg)
				}
			}
		}
	}()

	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := client.connectStream.Read(buf)
			if n > 0 {
				log.Printf("connect stream accepted data, but ignore")
			}

			if err == io.EOF {
				client.close()
				return
			}
			if err != nil {
				client.close()
				return
			}
		}
	}()
}

func (client *WebTransportClient) CreateStream() (quic.Stream, error) {
	if client.connected {
		stream, err := client.session.OpenStream()
		if err != nil {
			return nil, err
		}

		buf := &bytes.Buffer{}
		quicvarint.Write(buf, WebTransportStream)
		quicvarint.Write(buf, client.sessionId)

		stream.Write(buf.Bytes())

		return stream, nil
	}

	return nil, errors.New("client not connect")
}

func (client *WebTransportClient) CreateUniStream() (quic.SendStream, error) {
	if client.connected {
		stream, err := client.session.OpenUniStream()
		if err != nil {
			return nil, err
		}

		buf := &bytes.Buffer{}
		quicvarint.Write(buf, WebTransportUniStream)
		quicvarint.Write(buf, client.sessionId)

		stream.Write(buf.Bytes())

		return stream, nil
	}

	return nil, errors.New("client not connect")
}

func (client *WebTransportClient) SendMessage(message []byte) error {
	if client.connected {
		buf := &bytes.Buffer{}
		quicvarint.Write(buf, client.sessionId)
		buf.Write(message)
		return client.session.SendMessage(buf.Bytes())
	}
	return errors.New("client not connect")
}

func (client *WebTransportClient) close() {

	if client.session == nil {
		return
	}

	client.session = nil

	close(client.Stream)
	close(client.ReceiveStream)

	client.connectStream = nil
	client.settingsStream = nil
	client.ReceiveStream = nil
	client.Stream = nil
	client.connected = false

	if client.OnClose != nil {
		client.OnClose()
	}
}

func (client *WebTransportClient) Close(code quic.ApplicationErrorCode, message string) error {
	if !client.connected {
		client.connectStream.Close()
		err := client.session.CloseWithError(code, message)
		client.close()
		return err
	}
	return nil
}
