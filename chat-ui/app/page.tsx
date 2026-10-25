"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const configuredApiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : "https://chatgpt-1-o5xd.onrender.com");
const API_URL = new URL(
  /^[a-z][a-z\d+.-]*:\/\//i.test(configuredApiUrl)
    ? configuredApiUrl
    : `https://${configuredApiUrl}`,
).origin;

type AuthUser = { id: string; email: string };
type AuthSession = { accessToken: string; user: AuthUser };
type ChatMessage = { id: string; sender: "user" | "ai"; content: string };
type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};
type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function toConversationHistory(messages: ChatMessage[]): ConversationMessage[] {
  return messages.slice(-12).map((message) => ({
    role: message.sender === "ai" ? "assistant" : "user",
    content: message.content,
  }));
}

function isChatSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== "object") return false;
  const chat = value as Partial<ChatSession>;
  return (
    typeof chat.id === "string" &&
    typeof chat.title === "string" &&
    typeof chat.updatedAt === "number" &&
    Array.isArray(chat.messages) &&
    chat.messages.every(
      (message) =>
        message &&
        typeof message.id === "string" &&
        (message.sender === "user" || message.sender === "ai") &&
        typeof message.content === "string",
    )
  );
}

let refreshRequest: Promise<{ data: AuthSession }> | null = null;

function requestRefresh(): Promise<{ data: AuthSession }> {
  if (!refreshRequest) {
    refreshRequest = axios
      .post<AuthSession>(
        `${API_URL}/api/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [historyOwner, setHistoryOwner] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const latestMessageRef = useRef<HTMLDivElement>(null);
  /* eslint-disable react-hooks/set-state-in-effect -- Restore account-scoped browser history into the UI. */
  useEffect(() => {
    if (!user) {
      setChats([]);
      setMessages([]);
      setActiveChatId(null);
      setHistoryOwner(null);
      return;
    }

    try {
      const saved = window.localStorage.getItem(`my-chatgpt-chats:${user.id}`);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed) || !parsed.every(isChatSession)) {
        throw new Error("Saved chat history has an invalid format.");
      }
      const ordered = [...parsed].sort((a, b) => b.updatedAt - a.updatedAt);
      setChats(ordered);
      setActiveChatId(ordered[0]?.id ?? null);
      setMessages(ordered[0]?.messages ?? []);
      setHistoryError("");
    } catch (error) {
      setChats([]);
      setActiveChatId(null);
      setHistoryError(
        error instanceof Error
          ? `Unable to load saved chats: ${error.message}`
          : "Unable to load saved chats.",
      );
    }
    setHistoryOwner(user.id);
  }, [user]);

  useEffect(() => {
    if (!user || historyOwner !== user.id || messages.length === 0) return;
    const activeChat = chats.find((chat) => chat.id === activeChatId);
    if (activeChat?.messages === messages) return;
    const firstPrompt =
      messages.find((message) => message.sender === "user")?.content ?? "New chat";
    const nextChat: ChatSession = activeChat
      ? { ...activeChat, updatedAt: Date.now(), messages }
      : {
          id: createId(),
          title: firstPrompt.slice(0, 48),
          updatedAt: Date.now(),
          messages,
        };
    if (!activeChat) setActiveChatId(nextChat.id);
    setChats((previous) => [
      nextChat,
      ...previous.filter((chat) => chat.id !== nextChat.id),
    ]);
  }, [activeChatId, chats, historyOwner, messages, user]);

  useEffect(() => {
    if (!user || historyOwner !== user.id) return;
    try {
      window.localStorage.setItem(
        `my-chatgpt-chats:${user.id}`,
        JSON.stringify(chats),
      );
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? `Unable to save chat history: ${error.message}`
          : "Unable to save chat history.",
      );
    }
  }, [chats, historyOwner, user]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    let active = true;

    requestRefresh()
      .then((response) => {
        if (!active) return;
        setAccessToken(response.data.accessToken);
        setUser(response.data.user);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (!axios.isAxiosError(error) || error.response?.status !== 401) {
          setAuthError("Unable to connect to the server. Please try again.");
        }
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loading]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authBusy) return;

    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await axios.post<AuthSession>(
        `${API_URL}/api/auth/${authMode}`,
        { email, password },
        { withCredentials: true },
      );
      setAccessToken(response.data.accessToken);
      setUser(response.data.user);
      setPassword("");
    } catch (error) {
      setAuthError(
        axios.isAxiosError(error)
          ? error.response?.data?.error || error.message
          : error instanceof Error
            ? error.message
            : "Unable to authenticate.",
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      await axios.post(
        `${API_URL}/api/auth/logout`,
        {},
        {
          withCredentials: true,
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
        },
      );
      setUser(null);
      setAccessToken(null);
      setMessages([]);
      setInput("");
      setPassword("");
      setAuthMode("login");
    } catch (error) {
      setAuthError(
        axios.isAxiosError(error)
          ? error.response?.data?.error || error.message
          : error instanceof Error
            ? error.message
            : "Unable to log out.",
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading || !user || !accessToken) return;
    const history = toConversationHistory(messages);

    setLoading(true);
    setMessages((previous) => [
      ...previous,
      { id: createId(), sender: "user", content: prompt },
    ]);
    setInput("");

    try {
      let res;
      try {
        res = await axios.post(
          `${API_URL}/api/ai/generate`,
          { prompt, history },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 401) {
          throw error;
        }

        let refreshedToken: string;
        try {
          const refreshResponse = await requestRefresh();
          refreshedToken = refreshResponse.data.accessToken;
          if (typeof refreshedToken !== "string" || !refreshedToken) {
            throw new Error("The server did not return an access token.");
          }
          setAccessToken(refreshedToken);
          setUser(refreshResponse.data.user);
        } catch {
          setAccessToken(null);
          setUser(null);
          throw new Error("Your session expired. Please sign in again.");
        }

        res = await axios.post(
          `${API_URL}/api/ai/generate`,
          { prompt, history },
          { headers: { Authorization: `Bearer ${refreshedToken}` } },
        );
      }
      const generatedContent = res.data.generatedContent;
      if (typeof generatedContent !== "string" || !generatedContent.trim()) {
        throw new Error("The server returned an empty response.");
      }
      setMessages((previous) => [
        ...previous,
        { id: createId(), sender: "ai", content: generatedContent.trim() },
      ]);
    } catch (err) {
      const errorMessage =
        axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
      setMessages((previous) => [
        ...previous,
        { id: createId(), sender: "ai", content: errorMessage },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    if (loading) return;
    setActiveChatId(null);
    setMessages([]);
    setEditingMessageId(null);
    setEditDraft("");
    setInput("");
    setSidebarOpen(false);
  };

  const handleSelectChat = (chat: ChatSession) => {
    if (loading) return;
    setActiveChatId(chat.id);
    setMessages(chat.messages);
    setEditingMessageId(null);
    setEditDraft("");
    setSidebarOpen(false);
  };

  const handleDeleteChat = (chatId: string) => {
    if (loading) return;
    setChats((previous) => previous.filter((chat) => chat.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
      setEditingMessageId(null);
      setEditDraft("");
    }
  };

  const handleDeletePrompt = (messageIndex: number) => {
    if (loading) return;
    const nextMessages = messages.slice();
    nextMessages.splice(
      messageIndex,
      nextMessages[messageIndex + 1]?.sender === "ai" ? 2 : 1,
    );
    setMessages(nextMessages);
    setEditingMessageId(null);
    setEditDraft("");
    if (nextMessages.length === 0 && activeChatId) {
      setChats((previous) => previous.filter((chat) => chat.id !== activeChatId));
      setActiveChatId(null);
    }
  };

  const handleEditPrompt = async (messageIndex: number) => {
    const prompt = editDraft.trim();
    const editedMessage = messages[messageIndex];
    if (
      !prompt ||
      !editedMessage ||
      editedMessage.sender !== "user" ||
      loading ||
      !user ||
      !accessToken
    ) {
      return;
    }

    setLoading(true);
    setEditingMessageId(null);
    setEditDraft("");
    const updatedMessages = [
      ...messages.slice(0, messageIndex),
      { ...editedMessage, content: prompt },
    ];
    const history = toConversationHistory(updatedMessages.slice(0, -1));
    setMessages(updatedMessages);
    if (activeChatId) {
      setChats((previous) =>
        previous.map((chat) =>
          chat.id === activeChatId
            ? {
                ...chat,
                title: messageIndex === 0 ? prompt.slice(0, 48) : chat.title,
                updatedAt: Date.now(),
                messages: updatedMessages,
              }
            : chat,
        ),
      );
    }
    try {
      let response;
      try {
        response = await axios.post(
          `${API_URL}/api/ai/generate`,
          { prompt, history },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 401) {
          throw error;
        }
        let refreshResponse;
        try {
          refreshResponse = await requestRefresh();
        } catch {
          setAccessToken(null);
          setUser(null);
          throw new Error("Your session expired. Please sign in again.");
        }
        const refreshedToken = refreshResponse.data.accessToken;
        if (typeof refreshedToken !== "string" || !refreshedToken) {
          throw new Error("The server did not return an access token.");
        }
        setAccessToken(refreshedToken);
        setUser(refreshResponse.data.user);
        response = await axios.post(
          `${API_URL}/api/ai/generate`,
          { prompt, history },
          { headers: { Authorization: `Bearer ${refreshedToken}` } },
        );
      }
      const generatedContent = response.data.generatedContent;
      if (typeof generatedContent !== "string" || !generatedContent.trim()) {
        throw new Error("The server returned an empty response.");
      }
      setMessages((previous) => [
        ...previous,
        { id: createId(), sender: "ai", content: generatedContent.trim() },
      ]);
    } catch (error) {
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error || error.message
        : error instanceof Error
          ? error.message
          : "Something went wrong.";
      setMessages((previous) => [
        ...previous,
        { id: createId(), sender: "ai", content: errorMessage },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!authReady) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#0d0d0d] text-sm text-neutral-400">
        Checking your session...
      </main>
    );
  }

  if (!user || !accessToken) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#0d0d0d] px-4 font-sans text-[#ececec]">
        <section className="w-full max-w-md rounded-2xl border border-neutral-800 bg-[#171717] p-8 shadow-2xl">
          <p className="mb-2 text-sm font-medium text-neutral-400">My ChatGPT</p>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">
            {authMode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mb-7 text-sm text-neutral-400">
            Sign in or register to start chatting.
          </p>
          <form className="space-y-4" onSubmit={handleAuthSubmit}>
            <label className="block text-sm text-neutral-300">
              Email
              <input
                autoComplete="email"
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-[#212121] px-3 py-3 text-neutral-100 outline-none focus:border-neutral-400"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="block text-sm text-neutral-300">
              Password
              <input
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-[#212121] px-3 py-3 text-neutral-100 outline-none focus:border-neutral-400"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {authError && (
              <p aria-live="polite" className="text-sm text-red-300">
                {authError}
              </p>
            )}
            <button
              className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-medium text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={authBusy}
              type="submit"
            >
              {authBusy
                ? "Please wait..."
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
          <button
            className="mt-5 w-full text-sm text-neutral-400 hover:text-neutral-200"
            onClick={() => {
              setAuthMode(authMode === "login" ? "register" : "login");
              setAuthError("");
            }}
            type="button"
          >
            {authMode === "login"
              ? "New here? Create an account"
              : "Already registered? Sign in"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="relative flex h-dvh min-h-0 flex-row overflow-hidden bg-[#0d0d0d] font-sans text-[#ececec] antialiased selection:bg-neutral-800">
      {sidebarOpen && (
        <button
          aria-label="Close chat history"
          className="absolute inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      )}
      <aside
        className={`${sidebarOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-64 shrink-0 flex-col border-r border-neutral-800 bg-[#111111] md:static md:z-auto`}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <h1 className="text-lg font-semibold tracking-tight text-neutral-200">
            My ChatGPT
          </h1>
          <button
            aria-label="Close chat history"
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        <button
          className="mx-3 mb-5 flex items-center gap-3 rounded-lg border border-neutral-700 px-3 py-2.5 text-left text-sm text-neutral-100 transition hover:bg-neutral-800"
          onClick={handleNewChat}
          type="button"
        >
          <span className="text-lg leading-none">＋</span>
          New chat
        </button>
        <div className="px-4 pb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Your chats
        </div>
        <div className="chat-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {chats.map((chat) => (
            <div
              className={`group flex items-center gap-1 rounded-lg px-2 transition ${
                activeChatId === chat.id ? "bg-neutral-800" : "hover:bg-neutral-900"
              }`}
              key={chat.id}
            >
              <button
                className="min-w-0 flex-1 truncate py-2.5 text-left text-sm text-neutral-300 hover:text-white"
                onClick={() => handleSelectChat(chat)}
                title={chat.title}
                type="button"
              >
                {chat.title}
              </button>
              <button
                aria-label={`Delete chat ${chat.title}`}
                className="rounded p-1.5 text-neutral-500 opacity-0 transition hover:bg-neutral-700 hover:text-white focus:opacity-100 group-hover:opacity-100"
                disabled={loading}
                onClick={() => handleDeleteChat(chat.id)}
                type="button"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-10 0 .7 12h6.6L16 7m-6 0V4h4v3m-3 3v6m2-6v6" />
                </svg>
              </button>
            </div>
          ))}
          {chats.length === 0 && (
            <p className="px-2 py-3 text-sm text-neutral-500">Your conversations will appear here.</p>
          )}
        </div>
        {historyError && (
          <p aria-live="polite" className="border-t border-neutral-800 px-4 py-3 text-xs text-red-300">
            {historyError}
          </p>
        )}
        <div className="border-t border-neutral-800 px-4 py-4 text-sm text-neutral-400">
          {user.email}
        </div>
      </aside>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Top Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            aria-label="Open chat history"
            className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold tracking-tight text-neutral-200">
            {chats.find((chat) => chat.id === activeChatId)?.title ?? "New chat"}
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-neutral-400 sm:inline">{user.email}</span>
          <button
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-60"
            disabled={authBusy}
            onClick={handleLogout}
            type="button"
          >
            Log out
          </button>
        </div>
      </header>

      {authError && (
        <p
          aria-live="polite"
          className="absolute right-4 top-20 z-20 rounded-lg border border-red-900 bg-[#2a1515] px-4 py-3 text-sm text-red-200"
        >
          {authError}
        </p>
      )}

      {/* Chat History Area */}
      <div className="chat-scrollbar min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-36 pt-6">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-end space-y-6">
          {/* AI Response Display Area */}
          <div className="w-full min-w-0">
            {messages.length === 0 && (
              <div className="flex min-h-[48vh] items-center justify-center pb-24 text-center text-2xl font-medium tracking-tight text-neutral-200 sm:text-3xl">
                What can I help with?
              </div>
            )}
            {messages.map((msg, index) =>
              msg.sender === "user" ? (
                <div key={msg.id} className="group mb-4 flex w-full justify-end">
                  <div className="max-w-[min(85%,36rem)]">
                    {editingMessageId === String(index) ? (
                      <div className="rounded-2xl border border-neutral-700 bg-[#212121] p-3">
                        <textarea
                          autoFocus
                          className="min-h-20 w-full resize-y bg-transparent text-[15px] text-neutral-100 outline-none"
                          onChange={(event) => setEditDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setEditingMessageId(null);
                              setEditDraft("");
                            }
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void handleEditPrompt(index);
                            }
                          }}
                          value={editDraft}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            className="rounded-lg px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditDraft("");
                            }}
                            type="button"
                          >
                            Cancel
                          </button>
                          <button
                            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-black hover:bg-white disabled:opacity-50"
                            disabled={!editDraft.trim() || loading}
                            onClick={() => void handleEditPrompt(index)}
                            type="button"
                          >
                            Save &amp; regenerate
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="wrap-break-word rounded-3xl bg-[#102a43] px-4 py-2.5 text-[15px] text-neutral-100 shadow-sm">
                          {msg.content}
                        </div>
                        <div className="mt-1 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            aria-label="Edit prompt"
                            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                            disabled={loading}
                            onClick={() => {
                              setEditingMessageId(String(index));
                              setEditDraft(msg.content);
                            }}
                            type="button"
                          >
                            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.5 3.5 4 4M4 20l4.2-.8L20 7.4 16.6 4 4.8 15.8 4 20Z" />
                            </svg>
                          </button>
                          <button
                            aria-label="Delete prompt"
                            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-300"
                            disabled={loading}
                            onClick={() => handleDeletePrompt(index)}
                            type="button"
                          >
                            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-10 0 .7 12h6.6L16 7m-6 0V4h4v3m-3 6v4m2-4v4" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="mb-4 flex w-full justify-start pl-2">
                  <div className="response-markdown bg-transparent text-[17px] leading-8 text-neutral-200">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="mb-5 mt-8 text-3xl font-semibold leading-tight tracking-tight text-white first:mt-0">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="mb-4 mt-8 text-2xl font-semibold leading-tight tracking-tight text-white first:mt-0">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="mb-3 mt-6 text-xl font-semibold leading-snug text-white first:mt-0">
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p className="mb-5 last:mb-0 [overflow-wrap:anywhere]">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="mb-5 list-disc space-y-2 pl-7 marker:text-neutral-500 last:mb-0">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="mb-5 list-decimal space-y-2 pl-7 marker:text-neutral-400 last:mb-0">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => (
                        <li className="pl-1 [overflow-wrap:anywhere]">{children}</li>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-white">{children}</strong>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="my-6 border-l-2 border-neutral-600 pl-5 text-neutral-300">
                          {children}
                        </blockquote>
                      ),
                      a: ({ children, href }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-300 underline decoration-sky-300/40 underline-offset-4 hover:text-sky-200"
                        >
                          {children}
                        </a>
                      ),
                      pre: ({ children }) => (
                        <pre className="chat-scrollbar my-6 max-w-full overflow-x-auto rounded-xl border border-neutral-700/70 bg-[#171717] p-5 text-sm leading-6 text-neutral-100 shadow-lg">
                          {children}
                        </pre>
                      ),
                      code: ({ children }) => (
                        <code className="rounded-md bg-neutral-800 px-1.5 py-0.5 font-mono text-[0.88em] text-sky-100">
                          {children}
                        </code>
                      ),
                      hr: () => <hr className="my-8 border-neutral-700" />,
                      table: ({ children }) => (
                        <table className="my-6 w-full border-collapse text-left text-[15px] leading-7">
                          {children}
                        </table>
                      ),
                      th: ({ children }) => (
                        <th className="border-b border-neutral-600 px-4 py-3 font-semibold text-white">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="border-b border-neutral-800 px-4 py-3 align-top">
                          {children}
                        </td>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                  </div>
                </div>
              )
            )}
            {loading && (
              <div className="mb-4 flex w-full justify-start pl-2">
                <div className="flex items-center space-x-2 text-sm text-neutral-400">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-neutral-400"></div>
                  <div className="h-2 w-2 animate-pulse rounded-full bg-neutral-400 delay-75"></div>
                  <div className="h-2 w-2 animate-pulse rounded-full bg-neutral-400 delay-150"></div>
                </div>
              </div>
            )}
            <div ref={latestMessageRef} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Bottom Input Area */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[1100px] px-4 pb-4 pt-10">
        <div className="pointer-events-auto">
        <div className="relative flex items-center rounded-full border border-neutral-700/80 bg-[#212121]/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md transition-all focus-within:border-neutral-500">
          
          {/* Attachment Icon Placeholder */}
          <button className="text-neutral-400 hover:text-neutral-200 p-1 mr-2 transition-colors">
            <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>

          {/* Prompt Input */}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything"
            className="w-full bg-transparent pr-12 text-lg text-neutral-100 placeholder-neutral-500 focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />

          {/* Right Action Buttons */}
          <div className="absolute right-3 flex items-center space-x-1.5">
            <button 
              disabled={loading || !input.trim()}
              type="button"
              onClick={handleSend}
              className="flex items-center justify-center rounded-full bg-neutral-100 p-2 text-black shadow-md transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
              </svg>
            </button>
          </div>
        </div>

       
        </div>
      </div>

      </div>
    </div>
  );
}