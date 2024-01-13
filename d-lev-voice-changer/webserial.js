/*
  WebSerial wrapper
  Simplifies WebSerial

  created 15 May 2022
  modified 16 May 2022
  by Tom Igoe
*/

// TODO: multiple ports
// TODO: multiple data types

// need self = this for connect/disconnect functions
let self;

class WebSerialPort {
  constructor() {
    // if webserial doesn't exist, return false:
    if (!navigator.serial) {
      alert("WebSerial is not enabled in this browser");
      return false;
    }
    // TODO: make this an option.
    this.autoOpen = false;
    // copy this to a global variable so that
    // connect/disconnect can access it:
    self = this;

    // basic WebSerial properties:
    this.port;
    this.reader;
    this.serialReadPromise;
    // add an incoming data event:
    // TODO: data should probably be an ArrayBuffer or Stream
    this.incoming = {
      buf: ""
    }
    // incoming serial data event:
    this.dataEvent = new CustomEvent('data', {
      detail: this.incoming,
      bubbles: true
    });

    // TODO: bubble these up to calling script
    // so that you can change button names on 
    // connect or disconnect:
    navigator.serial.addEventListener("connect", this.serialConnect);
    navigator.serial.addEventListener("disconnect", this.serialDisconnect);

    // if the calling script passes in a message
    // and handler, add them as event listeners:
    this.on = (message, handler) => {
      parent.addEventListener(message, handler);
    };
  }

  async openPort(thisPort) {
      // if no port is passed to this function, 
      if (thisPort == null) {
        // pop up window to select port:
       this.port = await navigator.serial.requestPort();
      } else {
        // open the port that was passed:
        this.port = thisPort;
      }
      // from calling script:
      await this.port.open({ baudRate: 230400, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
      // start the listenForSerial function:
      this.serialReadPromise = this.listenForSerial();
  }

  async closePort() {
    if (this.port) {
      // stop the reader, so you can close the port:
      this.reader.cancel();
      // wait for the listenForSerial function to stop:
      await this.serialReadPromise;
      // close the serial port itself:
      await this.port.close();
      // clear the port variable:
      this.port = null;
    }
  }

  async sendSerial(data) {
    // if there's no port open, skip this function:
    if (!this.port) return;
    // if the port's writable: 
    if (this.port.writable) {
      // initialize the writer:
      const writer = this.port.writable.getWriter();
      // convert the data to be sent to an array:
      // TODO: make it possible to send as binary:
      var output = new TextEncoder().encode(data);
      // send it, then release the writer:
      writer.write(output).then(writer.releaseLock());
    }
  }

  async listenForSerial() {
    // if there's no serial port, return:
    if (!this.port) return;
    let in_buf = ""
    // while the port is open:
    while (this.port.readable) {
      // initialize the reader:
      this.reader = this.port.readable.getReader();
      try {
        // read incoming serial buffer:
        const { value, done } = await this.reader.read();
        if (value) {
          in_buf += new TextDecoder().decode(value);
          let caret_ind = in_buf.indexOf('>')
          if (caret_ind != -1) {
            this.incoming.buf = in_buf.slice(0, caret_ind)
            in_buf = in_buf.slice(caret_ind+1)
            parent.dispatchEvent(this.dataEvent);
          }
        }
        if (done) {
          break;
        }
      } catch (error) {
        // if there's an error reading the port:
        console.log(error);
      } finally {
        this.reader.releaseLock();
      }
    }
  }

  // this event occurs every time a new serial device
  // connects via USB:
  serialConnect(event) {
    console.log(event.target);
    // TODO: make autoOpen configurable
    if (self.autoOpen) {
      self.openPort(event.target);
    }
  }

  // this event occurs every time a new serial device
  // disconnects via USB:
  serialDisconnect(event) {
    console.log(event.target);
  }
}
