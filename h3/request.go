package h3

import (
	"context"
	"crypto/tls"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/marten-seemann/qpack"
)

type WebTransportConnectRequest struct {
	http.Request
	Protocol string
	ctx      context.Context
}

func cloneURL(u *url.URL) *url.URL {
	if u == nil {
		return nil
	}
	u2 := new(url.URL)
	*u2 = *u
	if u.User != nil {
		u2.User = new(url.Userinfo)
		*u2.User = *u.User
	}
	return u2
}

func (r *WebTransportConnectRequest) WithContext(ctx context.Context) *WebTransportConnectRequest {
	if ctx == nil {
		panic("nil context")
	}
	r2 := new(WebTransportConnectRequest)
	*r2 = *r

	r2.ctx = ctx
	r2.URL = cloneURL(r.URL) // legacy behavior; TODO: try to remove. Issue 23544
	return r2
}

func RequestFromHeaders(headers []qpack.HeaderField) (*WebTransportConnectRequest, error) {
	var path, authority, method, contentLengthStr, protocol string
	httpHeaders := http.Header{}

	for _, h := range headers {
		switch h.Name {
		case ":path":
			path = h.Value
		case ":method":
			method = h.Value
		case ":protocol":
			protocol = h.Value
		case ":authority":
			authority = h.Value
		case "content-length":
			contentLengthStr = h.Value
		default:
			if !h.IsPseudo() {
				httpHeaders.Add(h.Name, h.Value)
			}
		}
	}

	// concatenate cookie headers, see https://tools.ietf.org/html/rfc6265#section-5.4
	if len(httpHeaders["Cookie"]) > 0 {
		httpHeaders.Set("Cookie", strings.Join(httpHeaders["Cookie"], "; "))
	}

	isConnect := method == http.MethodConnect
	if isConnect {
		// if path != "" || authority == "" {
		// 	return nil, errors.New(":path must be empty and :authority must not be empty")
		// }
	} else if len(path) == 0 || len(authority) == 0 || len(method) == 0 {
		return nil, errors.New(":path, :authority and :method must not be empty")
	}

	var u *url.URL
	var requestURI string
	var err error

	if isConnect {
		u, err = url.ParseRequestURI("https://" + authority + path)
		if err != nil {
			return nil, err
		}
		requestURI = path
	} else {
		u, err = url.ParseRequestURI(path)
		if err != nil {
			return nil, err
		}
		requestURI = path
	}

	var contentLength int64
	if len(contentLengthStr) > 0 {
		contentLength, err = strconv.ParseInt(contentLengthStr, 10, 64)
		if err != nil {
			return nil, err
		}
	}

	return &WebTransportConnectRequest{
		Request: http.Request{
			Method:        method,
			URL:           u,
			Proto:         "HTTP/3",
			ProtoMajor:    3,
			ProtoMinor:    0,
			Header:        httpHeaders,
			Body:          nil,
			ContentLength: contentLength,
			Host:          authority,
			RequestURI:    requestURI,
			TLS:           &tls.ConnectionState{},
		},
		Protocol: protocol,
	}, nil
}
