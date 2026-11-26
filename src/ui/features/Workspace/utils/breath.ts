/**
 * A moment for the page: the rest of the work in a task of its own, after
 * whatever is waiting - a frame to draw, a key pressed. Not a frame's
 * callback, which a window out of sight is not given: a copy made just
 * before switching to another program finishes all the same.
 */
export function breath(): Promise<void> {
  return new Promise((done) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      done();
    };
    channel.port2.postMessage(null);
  });
}
