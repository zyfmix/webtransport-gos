package main

import (
	"log"
	"time"

	"git.baijiashilian.com/shared/brtc/webtransport-go"
	"github.com/lucas-clemente/quic-go"
	"github.com/paypal/hera/utility/encoding/netstring"
)

func main() {
	client := webtransport.CreateWebTransportClient(webtransport.ClientConfig{
		Path:       "/room",
		RemoteAddr: "localhost:4433",
		// RemoteAddr: "zgx-localhost-brtc.baijiayun.com:4433",
		InsecureSkipVerify: true,
	})

	go func(client *webtransport.WebTransportClient) {
		for stream := range client.Stream {
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
		client.OnMessage = func(message []byte) {
			log.Printf("webtransport receive message: %v", string(message))
			client.SendMessage(message)
		}
	}(client)

	err := client.Connect()

	if err != nil {
		log.Fatal(err)
		return
	}

	stream, err := client.CreateStream()

	if err != nil {
		log.Fatal(err)
		return
	}

	go func(stream quic.Stream) {

		defer stream.Close()
		decoder := netstring.NewNetstringReader(stream)

		for {
			message, err := decoder.ReadNext()
			if err != nil {
				log.Printf("error reading from stream %d: %v", stream.StreamID(), err)
				break
			}

			log.Printf("client webtransport stream receive: %v", string(message.Payload))
		}
	}(stream)

	msg := netstring.NewNetstringFrom(100, []byte("{\"jsonrpc\":\"2.0\",\"method\":\"joinRoom\",\"params\":{\"roomId\":\"6346@YG1O5y61cBcG0DNPRvvCXPBPVy8Gfd8e\",\"userId\":\"75470\",\"info\":{\"version\":\"test\",\"device\":\"mac/10.15.7 chrome/98.0.4758.80\",\"ua\":\"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36\",\"role\":\"anchor\",\"comments\":\"brtc-js-demo-web\",\"create\":true,\"network\":\"4g\",\"platform\":\"浏览器\"},\"sessionId\":null},\"id\":0}"))

	for {
		stream.Write(msg.Serialized)
		time.Sleep(time.Duration(1 * time.Second))
	}
}
