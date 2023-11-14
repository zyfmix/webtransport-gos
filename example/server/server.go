package main

import (
	"io"
	"log"
	"strings"

	"git.baijiashilian.com/shared/brtc/webtransport-go"
	"github.com/lucas-clemente/quic-go"
	"github.com/paypal/hera/utility/encoding/netstring"

	_ "net/http/pprof"
)

func handleCounterReceiveStream(tag string, str quic.ReceiveStream) {
	go func(str quic.ReceiveStream) {
		for {
			buf := make([]byte, 4096)
			n, err := str.Read(buf)
			if n > 0 {
				log.Printf("[tag: %s]webtransport server handle counter receive stream message: (n: %d)%v", tag, n, string(buf))
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
		ListenAddr: ":4433",
		//TLSCertPath:    "./data/certs/baijiayun.com.crt",
		//TLSKeyPath:     "./data/certs/baijiayun.com.key",
		TLSCertPath:    "./example/baijiayun.com.crt",
		TLSKeyPath:     "./example/baijiayun.com.key",
		AllowedOrigins: []string{"*"},
		Path:           "",
	})

	//go func() {
	//	http.ListenAndServe("0.0.0.0:9999", nil)
	//}()

	go func() {
		for transport := range server.Webtransport {
			if transport.Req.URL.Path == "/counter" {
				log.Printf("webtransport path %s", transport.Req.URL)

				go func(transport *webtransport.WebTransport) {
					stream, err := transport.CreateStream()
					if err != nil {
						return
					}

					handleCounterReceiveStream("ServerTransportCreateStream", stream)

					stream.Write([]byte("server counter stream test"))
				}(transport)

				go func(transport *webtransport.WebTransport) {
					stream, err := transport.CreateUniStream()
					if err != nil {
						return
					}

					stream.Write([]byte("server counter unistream test"))
				}(transport)

				transport.OnMessage = func(message []byte) {
					log.Printf("[counter]webtransport on message: %v", string(message))

					s := strings.ToUpper(string(message))

					transport.SendMessage([]byte(s))
				}

				go func(transport *webtransport.WebTransport) {
					for receiveStream := range transport.ReceiveStream {
						log.Printf("[counter]range for webtransport unistream %d", receiveStream.StreamID())
						handleCounterReceiveStream("ServerTransportReceiveStream", receiveStream)
					}
				}(transport)

				go func(transport *webtransport.WebTransport) {
					for stream := range transport.Stream {
						log.Printf("[counter]range for webtransport stream %d", stream.StreamID())

						go func(str quic.Stream) {
							defer str.Close()

							for {
								buf := make([]byte, 4096)
								n, err := str.Read(buf)
								if n > 0 {
									log.Printf("[counter]webtransport stream message: %v", string(buf))
									s := strings.ToUpper(string(buf[:n]))
									_, err = str.Write([]byte(s))
									if err != nil {
										log.Printf("[counter]error writing to stream %d: %v", str.StreamID(), err)
									}
								}
								if err == io.EOF {
									log.Printf("[counter]end reading from stream %d", str.StreamID())
									return
								}
								if err != nil {
									log.Printf("[counter]error reading from stream %d: %v", str.StreamID(), err)
									return
								}
							}
						}(stream)
					}
				}(transport)

				return
			}

			if transport.Req.URL.Path == "/room" {
				log.Printf("webtransport path %s", transport.Req.URL)

				go func(transport *webtransport.WebTransport) {
					for stream := range transport.Stream {
						log.Printf("[room]range fo webtransport stream %d", stream.StreamID())

						go func(str quic.Stream) {
							defer str.Close()
							decoder := netstring.NewNetstringReader(str)
							for {
								message, err := decoder.ReadNext()
								if err != nil {
									log.Printf("[room]error reading from stream %d: %v", str.StreamID(), err)
									break
								}
								log.Printf("[room]webtransport stream receive: %v", string(message.Payload))

								str.Write(message.Serialized)
							}
						}(stream)
					}
				}(transport)

				transport.OnMessage = func(message []byte) {
					log.Printf("[room]webtransport on message: %v", string(message))
					transport.SendMessage(message)
				}

				return
			}

			transport.Close(1000, "not support")
		}
	}()

	if err := server.Run(); err != nil {
		log.Fatal(err)
	}
}
