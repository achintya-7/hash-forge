package main

import (
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"fmt"
	"hash"
	"syscall/js"

	"github.com/zeebo/xxh3"
)

func main() {
	c := make(chan struct{}, 0)
	registerCallbacks()
	<-c
}

func registerCallbacks() {
	js.Global().Set("hashFile", js.FuncOf(hashFile))
}

func newHasher(alg string) (hash.Hash, error) {
	switch alg {
	case "xxh3":
		return xxh3.New(), nil
	case "sha256":
		return sha256.New(), nil
	case "sha512":
		return sha512.New(), nil
	case "sha1":
		return sha1.New(), nil
	case "md5":
		return md5.New(), nil
	default:
		return nil, fmt.Errorf("unsupported hash algorithm: %s", alg)
	}
}

func hashFile(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		js.Global().Call("console.error", "Usage: hashFile(fileData, algorithm)")
		return nil
	}

	fileData := args[0]
	algorithm := "xxh3"
	if len(args) > 1 {
		algorithm = args[1].String()
	}

	length := fileData.Get("length").Int()
	if length == 0 {
		js.Global().Call("console.error", "File data is empty")
		return nil
	}

	buffer := make([]byte, length)
	js.CopyBytesToGo(buffer, fileData)

	hasher, err := newHasher(algorithm)
	if err != nil {
		js.Global().Call("console.error", err.Error())
		return nil
	}

	bufferSize := 256 * 1024
	if length > bufferSize {
		for offset := 0; offset < length; {
			end := offset + bufferSize
			if end > length {
				end = length
			}

			chunk := buffer[offset:end]
			if len(chunk) == 0 {
				break
			}

			_, err := hasher.Write(chunk)
			if err != nil {
				js.Global().Call("console.error", "Failed to write data to the running hash:", err.Error())
				return nil
			}

			offset += len(chunk)
		}
	} else {
		hasher.Write(buffer)
	}

	hashBytes := hasher.Sum(nil)
	result := fmt.Sprintf("%x", hashBytes)
	fmt.Println("Hash calculated:", result)
	return result
}
