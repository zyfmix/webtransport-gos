package main

import (
	"io"
	"log"
	"strings"

	"net/http"

	"git.baijiashilian.com/shared/brtc/webtransport-go"
	"github.com/lucas-clemente/quic-go"
	"github.com/paypal/hera/utility/encoding/netstring"

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
	server := webtransport.CreateWebTransportServer(webtransport.ServerConfig{
		ListenAddr:     ":4433",
		TLSCertPath:    "../server.crt",
		TLSKeyPath:     "../server.key",
		AllowedOrigins: []string{"*"},
		Path:           "",
	})
	go func() {
		http.ListenAndServe("0.0.0.0:9999", nil)
	}()
	go func() {
		for transport := range server.Webtransport {

			if transport.Req.URL.Path == "/counter" {
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
			} else if transport.Req.URL.Path == "/room" {

				go func(transport *webtransport.WebTransport) {
					for stream := range transport.Stream {
						log.Printf("webtransport stream %d", stream.StreamID())

						go func(str quic.Stream) {
							defer str.Close()

							decoder := netstring.NewNetstringReader(str)

							for {
								message, err := decoder.ReadNext()

								if err != nil {
									log.Printf("error reading from stream %d: %v", str.StreamID(), err)
									break
								}

								log.Printf("webtransport stream receive: %v", string(message.Payload))

								str.Write(message.Serialized)
							}

						}(stream)
					}
				}(transport)

				transport.OnMessage = func(message []byte) {
					log.Printf("webtransport message: %v", string(message))
					transport.SendMessage(message)
				}
			} else {
				transport.Close(1000, "not support")
			}

		}
	}()
	if err := server.Run(); err != nil {
		log.Fatal(err)
	}
}
