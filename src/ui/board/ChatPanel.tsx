import { Component, For, createSignal, onCleanup } from 'solid-js';

export interface ChatMessage {
  from: string;
  text: string;
  time: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  class?: string;
}

const ChatPanel: Component<ChatPanelProps> = (props) => {
  const [input, setInput] = createSignal('');
  let messagesEnd: HTMLDivElement | undefined;

  // Auto-scroll on new messages
  const observer = new MutationObserver(() => {
    messagesEnd?.scrollIntoView({ behavior: 'smooth' });
  });

  onCleanup(() => observer.disconnect());

  function handleSend() {
    const text = input().trim();
    if (!text) return;
    props.onSend(text);
    setInput('');
  }

  return (
    <div class={`chat-panel ${props.class || ''}`}>
      <div class="chat-header">Chat</div>
      <div class="chat-messages" ref={(el) => {
        observer.observe(el, { childList: true });
      }}>
        <For each={props.messages}>
          {(msg) => (
            <div class="chat-msg">
              <span class="chat-time">{msg.time}</span>
              <span class="chat-from">{msg.from}</span>
              <span class="chat-text">{msg.text}</span>
            </div>
          )}
        </For>
        <div ref={messagesEnd} />
      </div>
      <input
        class="chat-input"
        type="text"
        placeholder="Type a message..."
        value={input()}
        onInput={(e) => setInput(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleSend(); } }}
        maxLength={200}
      />
    </div>
  );
};

export default ChatPanel;
