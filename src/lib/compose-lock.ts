// Simple global "someone is typing" flag.
//
// The dashboard polls live/mock data every 1-3s (clock, ping, client status).
// Those polls are meant to be invisible — but if a text input (like the Send
// Message textarea) happens to be open while a poll fires, any lost React
// state or stolen focus makes it feel like "the page refreshes and I can't
// type". Rather than chase every possible re-render path, components that
// own a text input the user is actively composing in call `setComposing`
// on mount/unmount, and the polling loops skip their state updates entirely
// while composing is active. No poll = nothing to re-render = nothing to
// interrupt typing with.

let composing = 0;

export function setComposing(active: boolean) {
  composing = Math.max(0, composing + (active ? 1 : -1));
}

export function isComposing() {
  return composing > 0;
}
