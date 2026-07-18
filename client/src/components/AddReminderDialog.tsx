import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(["event", "check_in"]),
  dueDate: z.string().optional(),
  checkInAfterDays: z.coerce.number().optional(),
  isRecurring: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

interface DefaultValues {
  title?: string;
  type?: "event" | "check_in";
  dueDate?: string;
  checkInAfterDays?: number;
  isRecurring?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contactId?: number;
  defaultValues?: DefaultValues;
  /** Custom dialog title, e.g. "Set up check-in" */
  dialogTitle?: string;
}

export default function AddReminderDialog({
  open,
  onClose,
  contactId,
  defaultValues,
  dialogTitle = "Add reminder",
}: Props) {
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: defaultValues?.title ?? "",
      type: defaultValues?.type ?? "event",
      dueDate: defaultValues?.dueDate ?? "",
      checkInAfterDays: defaultValues?.checkInAfterDays ?? 180,
      isRecurring: defaultValues?.isRecurring ?? false,
    },
  });

  const type = form.watch("type");

  // Re-apply defaultValues whenever the dialog opens (e.g. auto check-in popup
  // opens after the add-contact dialog closes with a fresh set of defaultValues).
  useEffect(() => {
    if (open) {
      form.reset({
        title: defaultValues?.title ?? "",
        type: defaultValues?.type ?? "event",
        dueDate: defaultValues?.dueDate ?? "",
        checkInAfterDays: defaultValues?.checkInAfterDays ?? 180,
        isRecurring: defaultValues?.isRecurring ?? false,
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      apiRequest("POST", "/api/reminders", {
        ...data,
        contactId: contactId ?? null,
        dueDate: data.dueDate || null,
        checkInAfterDays: data.type === "check_in" ? (data.checkInAfterDays ?? 180) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      if (contactId) {
        queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId, "reminders"] });
      }
      toast({ title: "Reminder added" });
      form.reset();
      onClose();
    },
    onError: () => {
      toast({ title: "Something went wrong", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => form.setValue("type", v as any)}>
              <SelectTrigger data-testid="select-reminder-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="event">Special event</SelectItem>
                <SelectItem value="check_in">Check-in reminder</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reminder-title">Title</Label>
            <Input
              id="reminder-title"
              placeholder={
                type === "event" ? "e.g. Wedding anniversary" : "e.g. Check in with Alex"
              }
              {...form.register("title")}
              data-testid="input-reminder-title"
            />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          {type === "event" && (
            <div className="space-y-1.5">
              <Label htmlFor="reminder-date">Date</Label>
              <Input
                id="reminder-date"
                type="date"
                {...form.register("dueDate")}
                data-testid="input-reminder-date"
              />
            </div>
          )}

          {type === "check_in" && (
            <div className="space-y-1.5">
              <Label htmlFor="check-in-days">Remind me if I haven't contacted them in (days)</Label>
              <Input
                id="check-in-days"
                type="number"
                min={1}
                {...form.register("checkInAfterDays")}
                data-testid="input-checkin-days"
              />
              <p className="text-xs text-muted-foreground">e.g. 180 = 6 months</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="recurring">Recurring reminder</Label>
            <Switch
              id="recurring"
              checked={form.watch("isRecurring")}
              onCheckedChange={(v) => form.setValue("isRecurring", v)}
              data-testid="switch-recurring"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Skip</Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save-reminder">
              {mutation.isPending ? "Saving…" : "Add reminder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
