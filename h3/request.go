package h3

import (
	"crypto/tls"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/marten-seemann/qpack"
)

func RequestFromHeaders(headers []qpack.HeaderField) (*http.Request, error) {
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

	return &http.Request{
		Method:        method,
		URL:           u,
		Proto:         protocol,
		ProtoMajor:    3,
		ProtoMinor:    0,
		Header:        httpHeaders,
		Body:          nil,
		ContentLength: contentLength,
		Host:          authority,
		RequestURI:    requestURI,
		TLS:           &tls.ConnectionState{},
	}, nil
}

func ResponseFromHeaders(headers []qpack.HeaderField) (*http.Response, error) {

	var statusCode int
	var statusText string
	httpHeaders := http.Header{}

	for _, hf := range headers {
		switch hf.Name {
		case ":status":
			status, err := strconv.Atoi(hf.Value)
			if err != nil {
				return nil, errors.New("malformed non-numeric status pseudo header")
			}
			statusCode = status
			statusText = hf.Value + " " + http.StatusText(status)
		default:
			httpHeaders.Add(hf.Name, hf.Value)
		}
	}

	return &http.Response{
		Proto:      "webtransport",
		Status:     statusText,
		StatusCode: statusCode,
		TLS:        &tls.ConnectionState{},
		Header:     httpHeaders,
		Body:       nil,
	}, nil
}
