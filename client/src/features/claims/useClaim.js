import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, uploadFile } from "../../lib/api";
import { ACTION_META, optimisticStatus } from "./claimModel";

export const claimKey = (id) => ["claim", id];

/** GET /api/claims/{id} — role-shaped by the server (admins: context + allowed actions; customers: safe projection). */
export function useClaim(id) {
  return useQuery({
    queryKey: claimKey(id),
    queryFn: ({ signal }) => api(`/claims/${encodeURIComponent(id)}`, { signal }),
    retry: (count, err) => !(err instanceof ApiError && [401, 403, 404].includes(err.status)) && count < 2,
    staleTime: 15_000,
  });
}

/** Every write refreshes Home (KPIs, list, donut, activity) so results show immediately (§11.6). */
function refreshEverywhere(qc) {
  qc.invalidateQueries({ queryKey: ["stats"] });
  qc.invalidateQueries({ queryKey: ["claims"] });
}

/**
 * Handler actions (POST /api/claims/{id}/actions): optimistic status change → rollback on error → toast with Undo (6 s)
 * where the server returned an undo token.
 */
export function useClaimAction(id) {
  const qc = useQueryClient();
  const key = claimKey(id);

  const undo = useMutation({
    mutationFn: (actionId) => api(`/claims/${id}/actions`, { method: "POST", body: { action: "undo", action_id: actionId } }),
    onSuccess: (data) => {
      qc.setQueryData(key, data.claim);
      refreshEverywhere(qc);
      toast.success("Change undone");
    },
    onError: (e) => toast.error(e.message || "Could not undo"),
  });

  return useMutation({
    mutationFn: (body) => api(`/claims/${id}/actions`, { method: "POST", body }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);
      if (previous) {
        const status = optimisticStatus(previous, body.action);
        qc.setQueryData(key, { ...previous, ...(status ? { status } : {}), _pending: body.action });
      }
      return { previous };
    },
    onError: (e, _body, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      if (!e.body?.detail?.fields || Object.keys(e.body.detail.fields).length === 0) toast.error(e.message || "The action failed");
    },
    onSuccess: (data, body) => {
      qc.setQueryData(key, data.claim);
      refreshEverywhere(qc);
      const meta = ACTION_META[body.action];
      toast.success(meta?.done ?? "Saved", {
        duration: (data.claim.undo_seconds ?? 6) * 1000,
        action: data.action_id ? { label: "Undo", onClick: () => undo.mutate(data.action_id) } : undefined,
      });
    },
  });
}

export function useSendMessage(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api(`/claims/${id}/messages`, { method: "POST", body }),
    onSuccess: (data) => {
      qc.setQueryData(claimKey(id), data.claim);
      refreshEverywhere(qc);
      toast.success("Message sent");
    },
    onError: (e) => toast.error(e.message || "Message not sent"),
  });
}

/** Regenerate the AI draft with the Communication agent (live Gemini; the template when the agent is unavailable). */
export function useRegenerateDraft(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/claims/${id}/messages/draft`, { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: claimKey(id) });
      if (data.source === "live") toast.success("New draft written by the Communication agent");
      else toast.warning("AI unavailable — template draft used");
    },
    onError: (e) => toast.error(e.message || "Could not regenerate the draft"),
  });
}

/** Customer: upload requested files then answer the information request. */
export function useRespondToRequest(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ files, message }) => {
      for (const f of files) {
        const kind = f.type.startsWith("image/") && f.kind !== "document" ? "photo" : "document";
        await uploadFile(`/uploads/${id}`, f.file ?? f, { kind: f.kind ?? kind, slot: f.slot ?? (kind === "photo" ? "closeup" : "other") });
      }
      return api(`/claims/${id}/respond`, { method: "POST", body: { message } });
    },
    onSuccess: (data) => {
      qc.setQueryData(claimKey(id), data.claim);
      refreshEverywhere(qc);
      toast.success("Thanks — we've received your response");
    },
    onError: (e) => toast.error(e.message || "Could not send your response"),
  });
}
