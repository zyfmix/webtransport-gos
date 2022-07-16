package h3

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/lucas-clemente/quic-go"
	"github.com/marten-seemann/qpack"
	"golang.org/x/net/http/httpguts"
	"golang.org/x/net/http2/hpack"
)

type requestWriter struct {
	mutex     sync.Mutex
	encoder   *qpack.Encoder
	headerBuf *bytes.Buffer
}

func NewRequestWriter() *requestWriter {
	headerBuf := &bytes.Buffer{}
	encoder := qpack.NewEncoder(headerBuf)
	return &requestWriter{
		encoder:   encoder,
		headerBuf: headerBuf,
	}
}

func (w *requestWriter) WriteRequest(str quic.Stream, req *http.Request, gzip bool) error {
	buf := &bytes.Buffer{}
	if err := w.writeHeaders(buf, req, gzip); err != nil {
		return err
	}
	if _, err := str.Write(buf.Bytes()); err != nil {
		return err
	}
	return nil
}

func (w *requestWriter) writeHeaders(wr io.Writer, req *http.Request, gzip bool) error {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	defer w.encoder.Close()

	if err := w.encodeHeaders(req, actualContentLength(req)); err != nil {
		return err
	}

	buf := &bytes.Buffer{}
	hf := HeadersFrame{Length: uint64(w.headerBuf.Len())}
	hf.Write(buf)
	if _, err := wr.Write(buf.Bytes()); err != nil {
		return err
	}
	if _, err := wr.Write(w.headerBuf.Bytes()); err != nil {
		return err
	}
	w.headerBuf.Reset()
	return nil
}

// copied from net/transport.go

func (w *requestWriter) encodeHeaders(req *http.Request, contentLength int64) error {
	host := req.Host
	if host == "" {
		host = req.URL.Host
	}
	host, err := httpguts.PunycodeHostPort(host)
	if err != nil {
		return err
	}

	var path string
	path = req.URL.RequestURI()
	if !validPseudoPath(path) {
		orig := path
		path = strings.TrimPrefix(path, req.URL.Scheme+"://"+host)
		if !validPseudoPath(path) {
			if req.URL.Opaque != "" {
				return fmt.Errorf("invalid request :path %q from URL.Opaque = %q", orig, req.URL.Opaque)
			} else {
				return fmt.Errorf("invalid request :path %q", orig)
			}
		}
	}

	enumerateHeaders := func(f func(name, value string)) {
		f(":authority", host)
		f(":method", req.Method)
		f(":path", path)
		f(":scheme", req.URL.Scheme)
		f(":protocol", req.Proto)
	}

	// Do a first pass over the headers counting bytes to ensure
	// we don't exceed cc.peerMaxHeaderListSize. This is done as a
	// separate pass before encoding the headers to prevent
	// modifying the hpack state.
	hlSize := uint64(0)
	enumerateHeaders(func(name, value string) {
		hf := hpack.HeaderField{Name: name, Value: value}
		hlSize += uint64(hf.Size())
	})

	// TODO: check maximum header list size
	// if hlSize > cc.peerMaxHeaderListSize {
	// 	return errRequestHeaderListSize
	// }

	// trace := httptrace.ContextClientTrace(req.Context())
	// traceHeaders := traceHasWroteHeaderField(trace)

	// Header list size is ok. Write the headers.
	enumerateHeaders(func(name, value string) {
		name = strings.ToLower(name)
		w.encoder.WriteField(qpack.HeaderField{Name: name, Value: value})
		// if traceHeaders {
		// 	traceWroteHeaderField(trace, name, value)
		// }
	})

	return nil
}

// validPseudoPath reports whether v is a valid :path pseudo-header
// value. It must be either:
//
//     *) a non-empty string starting with '/'
//     *) the string '*', for OPTIONS requests.
//
// For now this is only used a quick check for deciding when to clean
// up Opaque URLs before sending requests from the Transport.
// See golang.org/issue/16847
//
// We used to enforce that the path also didn't start with "//", but
// Google's GFE accepts such paths and Chrome sends them, so ignore
// that part of the spec. See golang.org/issue/19103.
func validPseudoPath(v string) bool {
	return (len(v) > 0 && v[0] == '/') || v == "*"
}

// actualContentLength returns a sanitized version of
// req.ContentLength, where 0 actually means zero (not unknown) and -1
// means unknown.
func actualContentLength(req *http.Request) int64 {
	if req.Body == nil {
		return 0
	}
	if req.ContentLength != 0 {
		return req.ContentLength
	}
	return -1
}
