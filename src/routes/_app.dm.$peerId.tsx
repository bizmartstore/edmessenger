import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageComposer } from "@/components/MessageComposer";
import { AttachmentList } from "@/components/AttachmentList";
import type { UploadedFile } from "@/lib/upload";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_app/dm/$peerId")({
  component: DMPage,
});

interface DM {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  attachments: UploadedFile[] | null;
  created_at: string;
}

function DMPage() {
  const { peerId } = Route.useParams();
  const { user } = useAuth();
  const [peer, setPeer] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);
  const [msgs, setMsgs] = useState<DM[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", peerId).maybeSingle();
      setPeer(p);
      const { data } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${user.id})`)
        .order("created_at", { ascending: true })
        .limit(200);
      setMsgs((data ?? []) as DM[]);
    })();
    const ch = supabase
      .channel(`dm-${peerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload) => {
        const row = payload.new as DM;
        const relevant =
          (row.sender_id === user.id && row.recipient_id === peerId) ||
          (row.sender_id === peerId && row.recipient_id === user.id);
        if (relevant) setMsgs((p) => [...p, row]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [peerId, user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  async function send(text: string, attachments: UploadedFile[]) {
    if (!user) return;
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id,
      recipient_id: peerId,
      content: text,
      attachments: attachments.length ? attachments : null,
    });
    if (error) throw error;
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-4 flex flex-col h-[calc(100dvh-9rem)]">
      <header className="flex items-center gap-3 pb-3 border-b border-border">
        <Link to="/chat" className="p-2 -ml-2 rounded-xl hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {peer?.avatar_url ? (
          <img src={peer.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div className="h-9 w-9 rounded-full gradient-primary grid place-items-center text-primary-foreground text-sm font-bold">
            {(peer?.full_name ?? "?")[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{peer?.full_name ?? "Student"}</div>
          <div className="text-[10px] text-muted-foreground">Private conversation</div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-3">
        {msgs.length === 0 && <div className="text-center text-xs text-muted-foreground py-10">No messages yet.</div>}
        {msgs.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} animate-fade-up`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? "gradient-primary text-primary-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md"}`}>
                {m.content && <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>}
                <AttachmentList files={m.attachments} />
                <div className={`text-[9px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="pt-2 sticky bottom-0">
        {user && <MessageComposer userId={user.id} onSend={send} placeholder={`Message ${peer?.full_name ?? "student"}…`} />}
      </div>
    </div>
  );
}
