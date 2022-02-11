package main

import (
	"io"
	"log"
	"strings"

	"net/http"

	"git.baijiashilian.com/shared/brtc/webtransport-go"
	"github.com/lucas-clemente/quic-go"

	_ "net/http/pprof"
)

func handleReceiveStream(str quic.ReceiveStream) {
	go func(str quic.ReceiveStream) {
		buf := make([]byte, 4096)
		for {
			n, err := str.Read(buf)
			if n > 0 {
				log.Printf("webtransport message: %v", string(buf))
			}
			if err == io.EOF {
				log.Printf("end reading from stream %d", str.StreamID())
				return
			}
			if err != nil {
				log.Printf("error reading from stream %d: %v", str.StreamID(), err)
				return
			}
		}
	}(str)
}

func main() {
	server := webtransport.CreateWebTransportServer(webtransport.Config{
		ListenAddr:     ":4433",
		TLSCertPath:    "server.crt",
		TLSKeyPath:     "server.key",
		AllowedOrigins: []string{"localhost", "::1", "172.31.100.22"},
		Path:           "/counter",
	})
	go func() {
		http.ListenAndServe("0.0.0.0:9999", nil)
	}()
	go func() {
		for transport := range server.Webtransport {

			transport.OnMessage = func(message []byte) {
				log.Printf("webtransport message: %v", string(message))

				s := strings.ToUpper(string(message))

				transport.SendMessage([]byte(s))

			}

			go func(transport *webtransport.WebTransport) {
				for receiveStream := range transport.ReceiveStream {
					log.Printf("webtransport unistream %d", receiveStream.StreamID())
					handleReceiveStream(receiveStream)
				}
			}(transport)
			go func(transport *webtransport.WebTransport) {
				for stream := range transport.Stream {
					log.Printf("webtransport stream %d", stream.StreamID())

					go func(str quic.Stream) {
						defer str.Close()

						buf := make([]byte, 4096)
						for {
							n, err := str.Read(buf)
							if n > 0 {
								log.Printf("webtransport message: %v", string(buf))

								s := strings.ToUpper(string(buf[:n]))

								_, err = str.Write([]byte(s))
								if err != nil {
									log.Printf("error writing to stream %d: %v", str.StreamID(), err)
								}
							}
							if err == io.EOF {
								log.Printf("end reading from stream %d", str.StreamID())
								return
							}
							if err != nil {
								log.Printf("error reading from stream %d: %v", str.StreamID(), err)
								return
							}
						}
					}(stream)
				}
			}(transport)

			go func(transport *webtransport.WebTransport) {
				stream, err := transport.CreateStream()

				if err != nil {
					return
				}
				handleReceiveStream(stream)

				stream.Write([]byte("server stream test"))
			}(transport)

			go func(transport *webtransport.WebTransport) {
				stream, err := transport.CreateUniStream()

				if err != nil {
					return
				}
				stream.Write([]byte("server unistream test"))
			}(transport)
		}
	}()
	if err := server.Run(); err != nil {
		log.Fatal(err)
	}
}
