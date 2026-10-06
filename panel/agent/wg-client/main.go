package main

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.zx2c4.com/wireguard/conn"
	"golang.zx2c4.com/wireguard/device"
	"golang.zx2c4.com/wireguard/tun/netstack"
)

func keygen(privatePath, publicPath string) error {
	private, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	if err := os.WriteFile(privatePath, []byte(hex.EncodeToString(private.Bytes())), 0600); err != nil {
		return err
	}
	return os.WriteFile(publicPath, []byte(base64.StdEncoding.EncodeToString(private.PublicKey().Bytes())), 0600)
}

func proxy(privatePath, clientIP, serverPublic, endpoint, portPath string) error {
	private, err := os.ReadFile(privatePath)
	if err != nil {
		return err
	}
	if len(private) != 64 {
		return errors.New("invalid private key")
	}
	publicBytes, err := base64.StdEncoding.DecodeString(serverPublic)
	if err != nil || len(publicBytes) != 32 {
		return errors.New("invalid server key")
	}
	ip, err := netip.ParseAddr(clientIP)
	if err != nil || !ip.Is4() {
		return errors.New("invalid client IP")
	}
	host, portText, err := net.SplitHostPort(endpoint)
	if err != nil {
		return errors.New("invalid endpoint")
	}
	serverIP, err := netip.ParseAddr(host)
	if err != nil || !serverIP.Is4() {
		return errors.New("endpoint must use an IPv4 address")
	}
	udpPort, err := strconv.Atoi(portText)
	if err != nil || udpPort < 1 || udpPort > 65535 {
		return errors.New("invalid endpoint port")
	}
	tun, network, err := netstack.CreateNetTUN([]netip.Addr{ip}, nil, 1420)
	if err != nil {
		return err
	}
	dev := device.NewDevice(tun, conn.NewDefaultBind(), device.NewLogger(device.LogLevelError, "certua-wg: "))
	defer dev.Close()
	config := fmt.Sprintf("private_key=%s\npublic_key=%s\nallowed_ip=10.145.20.1/32\nendpoint=%s\npersistent_keepalive_interval=25\n",
		strings.TrimSpace(string(private)), hex.EncodeToString(publicBytes), endpoint)
	if err := dev.IpcSet(config); err != nil {
		return err
	}
	if err := dev.Up(); err != nil {
		return err
	}
	transport := &http.Transport{Proxy: nil, DialContext: network.DialContext, DisableKeepAlives: true}
	client := &http.Client{Transport: transport, Timeout: 25 * time.Second}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	defer listener.Close()
	handler := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet || request.URL.Host != "10.145.20.1:4182" ||
			request.URL.Path != "/api/agent/module" {
			http.Error(writer, "not allowed", http.StatusForbidden)
			return
		}
		upstream, err := http.NewRequestWithContext(request.Context(), http.MethodGet, request.URL.String(), nil)
		if err != nil {
			http.Error(writer, "invalid request", 400)
			return
		}
		response, err := client.Do(upstream)
		if err != nil {
			http.Error(writer, "tunnel unavailable", 502)
			return
		}
		defer response.Body.Close()
		writer.Header().Set("Content-Type", response.Header.Get("Content-Type"))
		writer.WriteHeader(response.StatusCode)
		io.CopyN(writer, response.Body, 16<<20)
	})
	port := listener.Addr().(*net.TCPAddr).Port
	if err := os.WriteFile(portPath, []byte(strconv.Itoa(port)), 0600); err != nil {
		return err
	}
	return http.Serve(listener, handler)
}

func main() {
	var err error
	switch {
	case len(os.Args) == 4 && os.Args[1] == "keygen":
		err = keygen(os.Args[2], os.Args[3])
	case len(os.Args) == 7 && os.Args[1] == "proxy":
		err = proxy(os.Args[2], os.Args[3], os.Args[4], os.Args[5], os.Args[6])
	default:
		err = errors.New("usage: wg-client keygen <private> <public> | proxy <private> <ip> <server-key> <endpoint> <port-file>")
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
