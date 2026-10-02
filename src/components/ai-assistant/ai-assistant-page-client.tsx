'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import {
  SendIcon,
  SparklesIcon,
  UserIcon,
  Loader2Icon,
  InfoIcon,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useReconciliation } from '@/lib/reconciliation-context';
import { buildContextSummary } from '@/lib/ai/context';
import {
  PROVIDERS,
  type ProviderId,
  type TokenUsage,
} from '@/lib/ai/providers';
import { useAiUsage } from '@/lib/ai-usage-context';
import { cn } from '@/lib/utils';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  demo?: boolean;
}

const SUGGESTED_PROMPTS = [
  "Summarize this month's reconciliation results",
  'Which exceptions need investigation first?',
  "Why weren't the Dynamics and bank records matched?",
];

export function AiAssistantPageClient() {
  const result = useReconciliation();
  const contextSummary = useMemo(() => buildContextSummary(result), [result]);
  const { logUsage } = useAiUsage();

  const [provider, setProvider] = useState<ProviderId>('ai-factory');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages: DisplayMessage[] = [
      ...messages,
      { role: 'user', content: trimmed },
    ];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          context: contextSummary,
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data: { reply: string; usage?: TokenUsage; configured: boolean } =
        await res.json();
      if (!res.ok)
        throw new Error(
          (data as unknown as { error?: string }).error ||
            `Request failed (${res.status})`
        );

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply, demo: !data.configured },
      ]);
      logUsage({ provider, usage: data.usage ?? null, source: 'ai-assistant' });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Something went wrong reaching the assistant'
      );
    } finally {
      setLoading(false);
    }
  }

  const providerMeta = PROVIDERS.find((p) => p.id === provider)!;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-col items-start gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <SparklesIcon className="size-4" />
              AI Assistant
            </CardTitle>
            <CardDescription>
              Grounded in the reconciliation results currently loaded —{' '}
              {providerMeta.description}
            </CardDescription>
          </div>
          <Select
            value={provider}
            onValueChange={(v) => v && setProvider(v as ProviderId)}
          >
            <SelectTrigger className="shrink-0">
              <SelectValue />
            </SelectTrigger>
            {/* min-w wide enough for the longest label ("Cassava AI Factory") plus
                the checkmark — the default min-w-36 clamps to the trigger's own
                (much narrower) width and the selected item's check icon overlaps
                the label text as a result. align="end" anchors the popup's right
                edge to the trigger's right edge instead of centering it, so it
                opens over empty space to the left rather than across the
                description text. */}
            <SelectContent className="min-w-56" align="end">
              {PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-0">
          <div
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto px-6 py-4"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-4 py-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-secondary">
                  <SparklesIcon className="size-5 text-muted-foreground" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Ask about matches, exceptions, or specific reference numbers.
                  Answers are grounded in the extracts uploaded on the Data
                  Sources page.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 text-sm text-neutral-600 transition-colors hover:bg-neutral-100/70 hover:text-neutral-900 cursor-pointer"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-3',
                  m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                <div
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary'
                  )}
                >
                  {m.role === 'user' ? (
                    <UserIcon className="size-3.5" />
                  ) : (
                    <SparklesIcon className="size-3.5" />
                  )}
                </div>
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-sky-100 dark:bg-sky-900 border border-sky-200/60 p-5 rounded-xl shadow-xs text-slate-800 dark:text-neutral-200 leading-relaxed'
                  )}
                >
                  {m.content}
                  {m.demo && (
                    <div className="mt-2 flex items-center gap-1 text-[11px] opacity-70">
                      <InfoIcon className="size-3" />
                      Demo mode — no API key configured for this provider
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Thinking…
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <div className="relative flex items-center rounded-xl border border-neutral-200 bg-background px-4 py-3 shadow-xs focus-within:ring-2 focus-within:ring-primary/20">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about this month's reconciliation..."
              className="min-h-10 flex-1 resize-none border-0 shadow-none focus-visible:ring-0"
              rows={1}
            />
            <Button
              size="icon"
              className="size-10 shrink-0"
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
            >
              <SendIcon className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Grounded on:</span>
        <Badge
          variant="secondary"
          className="bg-slate-100 text-slate-700 font-mono text-xs px-2.5 py-1 rounded-full"
        >
          {result.totalsBySource.dynamics.count} Dynamics
        </Badge>
        <Badge
          variant="secondary"
          className="bg-slate-100 text-slate-700 font-mono text-xs px-2.5 py-1 rounded-full"
        >
          {result.totalsBySource.prism.count} Prism
        </Badge>
        <Badge
          variant="secondary"
          className="bg-slate-100 text-slate-700 font-mono text-xs px-2.5 py-1 rounded-full"
        >
          {result.totalsBySource.bank.count} Bank
        </Badge>
      </div>
    </div>
  );
}
