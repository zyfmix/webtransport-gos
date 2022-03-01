package webtransport

import (
	"bytes"
	"context"
	"crypto/tls"
	"io"
	"log"
	"net/http"
	"time"

	"git.baijiashilian.com/shared/brtc/webtransport-go/h3"

	"github.com/lucas-clemente/quic-go"
	"github.com/lucas-clemente/quic-go/http3"
	"github.com/lucas-clemente/quic-go/quicvarint"
	"github.com/marten-seemann/qpack"
)

// ClientIndication, see https://tools.ietf.org/html/draft-vvv-webtransport-quic-02#section-3.2
type ClientIndication struct {
	// Origin indication value.
	Origin string
	// Path indication value.
	Path string
}

// Config for WebTransportServerQuic.
type ServerConfig struct {
	http.Handler
	// ListenAddr sets an address to bind server to.
	ListenAddr string
	// TLSCertPath defines a path to .crt cert file.
	TLSCertPath string
	// TLSKeyPath defines a path to .key cert file
	TLSKeyPath string
	// AllowedOrigins represents list of allowed origins to connect from.
	AllowedOrigins []string

	Path string
}

// WebTransportServer can handle WebTransport QUIC connections.
// communication with UDP datagram mentioned in
// https://tools.ietf.org/html/draft-vvv-webtransport-quic-02#section-5
// quic-go should implement https://tools.ietf.org/html/draft-ietf-quic-datagram-00
// draft (there is an ongoing pull request – see https://github.com/lucas-clemente/quic-go/pull/2162).
type WebTransportServer struct {
	ServerConfig
	Webtransport chan *WebTransport
}

func CreateWebTransportServer(config ServerConfig) *WebTransportServer {
	if config.Handler == nil {
		config.Handler = http.DefaultServeMux
	}
	return &WebTransportServer{
		ServerConfig: config,
		Webtransport: make(chan *WebTransport),
	}
}

// Run server.
func (s *WebTransportServer) Run() error {
	listener, err := quic.ListenAddr(s.ListenAddr, s.generateTLSConfig(), &quic.Config{
		EnableDatagrams:      true,
		HandshakeIdleTimeout: 30 * time.Second,
		MaxIdleTimeout:       1 * 60 * time.Second,
		KeepAlive:            false,
	})
	if err != nil {
		return err
	}
	log.Printf("WebTransport Server listening on: %s", s.ListenAddr)
	for {
		sess, err := listener.Accept(context.Background())
		if err != nil {
			return err
		}
		log.Printf("session accepted: %s", sess.RemoteAddr().String())

		go s.handleSession(sess)
	}
}

// https://datatracker.ietf.org/doc/html/draft-ietf-masque-h3-datagram-05#section-9.1
const H3_DATAGRAM_05 = 0xffd277

// https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-h3-websockets-00#section-5
const ENABLE_CONNECT_PROTOCOL = 0x08

// https://www.ietf.org/archive/id/draft-ietf-webtrans-http3-01.html#section-7.2
const ENABLE_WEBTRNASPORT = 0x2b603742

func (s *WebTransportServer) handleSession(sess quic.Session) {
	str, err := sess.OpenUniStream()
	if err != nil {
		return
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
	str.Write(buf.Bytes())

	settingsStream, err := sess.AcceptUniStream(context.Background())
	if err != nil {
		log.Println(err)
		return
	}
	log.Printf("read settings from control stream id: %d", settingsStream.StreamID())

	requestStream, err := sess.AcceptStream(context.Background())
	if err != nil {
		log.Printf("request stream err: %v", err)
		return
	}
	log.Printf("request stream accepted: %d", requestStream.StreamID())

	ctx := requestStream.Context()
	ctx = context.WithValue(ctx, http3.ServerContextKey, s)
	ctx = context.WithValue(ctx, http.LocalAddrContextKey, sess.LocalAddr())
	frame, err := h3.ParseNextFrame(requestStream)
	if err != nil {
		log.Printf("request stream ParseNextFrame err: %v", err)
		return
	}
	hf, ok := frame.(*h3.HeadersFrame)
	if !ok {
		log.Println("request stream got not HeadersFrame")
		return
	}
	headerBlock := make([]byte, hf.Length)
	if _, err := io.ReadFull(requestStream, headerBlock); err != nil {
		log.Printf("request stream read headerBlock err: %v", err)
	}
	decoder := qpack.NewDecoder(nil)
	hfs, err := decoder.DecodeFull(headerBlock)
	if err != nil {
		log.Printf("request stream decoder err: %v", err)
		return
	}
	req, err := h3.RequestFromHeaders(hfs)
	if err != nil {
		log.Printf("request stream RequestFromHeaders err: %v", err)
		return
	}

	req.RemoteAddr = sess.RemoteAddr().String()
	req = req.WithContext(ctx)
	r := h3.NewResponseWriter(requestStream)
	r.Header().Add("sec-webtransport-http3-draft", "draft02")

	// https://datatracker.ietf.org/doc/draft-ietf-webtrans-http3/ 3.3.  Creating a New Session
	if req.Method == "CONNECT" && req.Proto == "webtransport" && (req.URL.Path == s.Path || s.Path == "") {
		r.WriteHeader(200)
		r.Flush()
	} else {
		r.WriteHeader(404)
		r.Flush()
		return
	}

	transport := createWebTransport(sess, req, requestStream, settingsStream)

	s.Webtransport <- transport

}

func (s *WebTransportServer) generateTLSConfig() *tls.Config {
	cert, err := tls.LoadX509KeyPair(s.TLSCertPath, s.TLSKeyPath)
	if err != nil {
		log.Fatal(err)
	}
	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		NextProtos:   []string{"h3", "h3-32", "h3-31", "h3-30", "h3-29"},
	}
}
