package webtransport

import (
	"bytes"
	"context"
	"io"
	"log"
	"time"

	"git.baijiashilian.com/shared/brtc/webtransport-go/h3"
	"github.com/lucas-clemente/quic-go"
	"github.com/lucas-clemente/quic-go/quicvarint"
)

type WebTransport struct {
	session quic.Session
	Req     *h3.WebTransportConnectRequest

	// Incoming bidirectional HTTP/3 streams (e.g. WebTransport)
	Stream chan quic.Stream

	// Incoming unidirectional HTTP/3 streams (e.g. WebTransport)
	ReceiveStream chan quic.ReceiveStream

	OnMessage func([]byte)

	OnClose func()

	sessionId uint64

	connectStream quic.Stream

	settingsStream quic.ReceiveStream
}

type byteReader interface {
	io.ByteReader
	io.Reader
}

type byteReaderImpl struct{ io.Reader }

const (
	WebTransportStream    = 0x41
	WebTransportUniStream = 0x54
)

func (br *byteReaderImpl) ReadByte() (byte, error) {
	b := make([]byte, 1)
	if _, err := br.Reader.Read(b); err != nil {
		return 0, err
	}
	return b[0], nil
}

func CreateWebTransport(session quic.Session, req *h3.WebTransportConnectRequest, connectStream quic.Stream, settingsStream quic.ReceiveStream) *WebTransport {
	transport := &WebTransport{
		session:        session,
		Req:            req,
		Stream:         make(chan quic.Stream),
		ReceiveStream:  make(chan quic.ReceiveStream),
		sessionId:      0,
		connectStream:  connectStream,
		settingsStream: settingsStream,
	}

	go func() {
		for {
			stream, err := session.AcceptUniStream(session.Context())
			if err != nil {
				transport.close()
				return
			}

			if stream.StreamID() == transport.settingsStream.StreamID() {
				continue
			}

			go func(stream quic.ReceiveStream) {

				ctx := context.Background()
				done := make(chan struct{}, 1)

				go func(ctx context.Context) {

					defer func() {
						done <- struct{}{}
					}()

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

						log.Printf("receiveStream accepted streamId: %d, sessionId: %d", stream.StreamID(), sessionId)

						transport.sessionId = sessionId
						transport.ReceiveStream <- stream
					}
				}(ctx)

				select {
				case <-done:
					return
				// 如果是 webtransport stream 则一定会读取到头数据，否则超时退出
				case <-time.After(time.Duration(10 * time.Millisecond)):
					return
				}

			}(stream)

		}
	}()

	go func() {
		for {
			stream, err := session.AcceptStream(session.Context())
			if err != nil {
				transport.close()
				return
			}

			if stream.StreamID() == transport.connectStream.StreamID() {
				continue
			}

			go func(stream quic.Stream) {

				ctx := context.Background()
				done := make(chan struct{}, 1)

				go func(ctx context.Context) {
					defer func() {
						done <- struct{}{}
					}()

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

						log.Printf("stream accepted streamId: %d, sessionId: %d", stream.StreamID(), sessionId)

						transport.sessionId = sessionId
						transport.Stream <- stream
					}
				}(ctx)

				select {
				case <-done:
					return
				// 如果是 webtransport stream 则一定会读取到头数据，否则超时退出
				case <-time.After(time.Duration(10 * time.Millisecond)):
					return
				}
			}(stream)
		}
	}()

	go func() {
		for {
			msg, err := session.ReceiveMessage()

			if err != nil {
				transport.close()
				return
			}

			len := len(msg)

			if len > 0 {
				// TODO https://datatracker.ietf.org/doc/draft-ietf-webtrans-http3/ Session Termination 结束 session
				if transport.OnMessage != nil {
					transport.OnMessage(msg)
				}
			}
		}
	}()

	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := connectStream.Read(buf)

			if n > 0 {
				log.Printf("connect stream accepted data, but ignore")
			}

			if err == io.EOF {
				transport.close()
				return
			}
			if err != nil {
				transport.close()
				return
			}
		}
	}()

	return transport
}

func (transport *WebTransport) CreateStream() (quic.Stream, error) {
	stream, err := transport.session.OpenStream()

	if err != nil {
		return nil, err
	}

	buf := &bytes.Buffer{}

	quicvarint.Write(buf, WebTransportStream)
	quicvarint.Write(buf, transport.sessionId)

	stream.Write(buf.Bytes())

	return stream, nil
}

func (transport *WebTransport) CreateUniStream() (quic.SendStream, error) {

	stream, err := transport.session.OpenUniStream()

	if err != nil {
		return nil, err
	}

	buf := &bytes.Buffer{}
	quicvarint.Write(buf, WebTransportUniStream)
	quicvarint.Write(buf, transport.sessionId)
	stream.Write(buf.Bytes())

	return stream, nil
}

func (transport *WebTransport) SendMessage(message []byte) error {
	return transport.session.SendMessage(message)
}

func (transport *WebTransport) close() {

	if transport.session == nil {
		return
	}

	transport.session = nil

	close(transport.Stream)
	close(transport.ReceiveStream)

	transport.connectStream = nil
	transport.settingsStream = nil
	transport.Req = nil
	transport.ReceiveStream = nil
	transport.Stream = nil

	if transport.OnClose != nil {
		transport.OnClose()
	}
}

func (transport *WebTransport) Close(code quic.ApplicationErrorCode, message string) error {
	err := transport.session.CloseWithError(code, message)
	transport.close()
	return err
}
