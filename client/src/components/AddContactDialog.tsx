import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CONTACT_METHOD_TYPES } from "@/lib/utils";
import { useTags } from "@/hooks/useTags";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { useRef, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional().default(""),
  birthday: z.string().optional(),
  notes: z.string().optional().default(""),
  connectionTags: z.array(z.string()).default([]),
  industryTags: z.array(z.string()).default([]),
  contactMethods: z.array(z.object({ type: z.string(), value: z.string() })).default([]),
  photo: z.string().optional(),
  lastContactedAt: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  defaultValues?: Partial<FormData> & { id?: number };
  mode?: "add" | "edit";
  /** Called after a new contact is saved — receives full name so caller can open check-in dialog */
  onContactAdded?: (contactId: number, fullName: string) => void;
}

function TagPickerSection({
  label,
  allTags,
  selected,
  onToggle,
  onAdd,
  onDelete,
}: {
  label: string;
  allTags: string[];
  selected: string[];
  onToggle: (tag: string) => void;
  onAdd: (tag: string) => void;
  onDelete: (tag: string) => void;
}) {
  const [newTag, setNewTag] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    // Add to global tag list AND select it for this contact
    onAdd(trimmed);
    onToggle(trimmed);
    setNewTag("");
    setShowCreate(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {/* Existing tags — click to toggle selection, hover for delete */}
      <div className="flex flex-wrap gap-2">
        {allTags.map((tag) => (
          <div key={tag} className="relative group/tag flex items-center">
            <button
              type="button"
              onClick={() => onToggle(tag)}
              className={`tag-pill cursor-pointer border transition-colors pr-6 ${
                selected.includes(tag)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:border-primary"
              }`}
            >
              {tag}
            </button>
            {/* Delete button — appears on hover */}
            <button
              type="button"
              title={`Delete "${tag}" tag permanently`}
              onClick={(e) => { e.stopPropagation(); onDelete(tag); }}
              className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/tag:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        {/* Create new tag button */}
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="tag-pill cursor-pointer border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center gap-1"
          >
            <Plus size={11} />
            New tag
          </button>
        )}
      </div>
      {/* Inline create-new-tag input */}
      {showCreate && (
        <div className="flex gap-2 mt-1">
          <Input
            autoFocus
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleCreate(); }
              if (e.key === "Escape") { setShowCreate(false); setNewTag(""); }
            }}
            placeholder={`New ${label.toLowerCase()} tag…`}
            className="h-8 text-sm flex-1"
          />
          <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={handleCreate}>
            <Plus size={13} className="mr-1" />
            Add
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setShowCreate(false); setNewTag(""); }}>
            <X size={13} />
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Click a tag to select it. Hover and click ✕ to delete it permanently.</p>
    </div>
  );
}

export default function AddContactDialog({ open, onClose, defaultValues, mode = "add", onContactAdded }: Props) {
  const { toast } = useToast();
  const [photoPreview, setPhotoPreview] = useState<string | undefined>(defaultValues?.photo);
  const fileRef = useRef<HTMLInputElement>(null);
  const { connectionTags: allConnectionTags, industryTags: allIndustryTags, addConnectionTag, removeConnectionTag, addIndustryTag, removeIndustryTag } = useTags();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: defaultValues?.firstName ?? "",
      lastName: defaultValues?.lastName ?? "",
      birthday: defaultValues?.birthday ?? "",
      notes: defaultValues?.notes ?? "",
      connectionTags: defaultValues?.connectionTags ?? [],
      industryTags: defaultValues?.industryTags ?? [],
      contactMethods: defaultValues?.contactMethods ?? [],
      photo: defaultValues?.photo ?? "",
      lastContactedAt: defaultValues?.lastContactedAt ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "contactMethods",
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const body = {
        ...data,
        connectionTags: JSON.stringify(data.connectionTags),
        industryTags: JSON.stringify(data.industryTags),
        contactMethods: JSON.stringify(data.contactMethods),
        photo: photoPreview ?? null,
        birthday: data.birthday || null,
        lastContactedAt: data.lastContactedAt || null,
      };
      if (mode === "edit" && defaultValues?.id) {
        const res = await apiRequest("PATCH", `/api/contacts/${defaultValues.id}`, body);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/contacts", body);
      return res.json();
    },
    onSuccess: (contact) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: mode === "edit" ? "Contact updated" : "Contact added" });
      form.reset();
      setPhotoPreview(undefined);
      onClose();
      // Trigger check-in dialog after adding new contact
      if (mode === "add" && onContactAdded && contact?.id) {
        const fullName = `${contact.firstName} ${contact.lastName}`.trim();
        onContactAdded(contact.id, fullName);
      }
    },
    onError: () => {
      toast({ title: "Something went wrong", variant: "destructive" });
    },
  });

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const connectionTagsValue = form.watch("connectionTags");
  const industryTagsValue = form.watch("industryTags");

  const toggleTag = (arr: string[], val: string, field: "connectionTags" | "industryTags") => {
    const next = arr.includes(val) ? arr.filter((t) => t !== val) : [...arr, val];
    form.setValue(field, next);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit contact" : "Add contact"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
          <Tabs defaultValue="basics">
            <TabsList className="w-full">
              <TabsTrigger value="basics" className="flex-1">Basics</TabsTrigger>
              <TabsTrigger value="tags" className="flex-1">Tags</TabsTrigger>
              <TabsTrigger value="contact" className="flex-1">Contact info</TabsTrigger>
              <TabsTrigger value="notes" className="flex-1">Notes</TabsTrigger>
            </TabsList>

            {/* Basics tab */}
            <TabsContent value="basics" className="space-y-4 pt-2">
              {/* Photo */}
              <div className="flex items-center gap-4">
                <div
                  className="w-20 h-20 rounded-full border-2 border-dashed border-border photo-upload-area flex items-center justify-center cursor-pointer overflow-hidden bg-muted"
                  onClick={() => fileRef.current?.click()}
                  data-testid="button-upload-photo"
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <Upload size={20} className="text-muted-foreground" />
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Click the circle to upload a photo</Label>
                  {photoPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs mt-1 text-muted-foreground h-6 px-2"
                      onClick={() => setPhotoPreview(undefined)}
                    >
                      Remove photo
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name *</Label>
                  <Input id="firstName" {...form.register("firstName")} data-testid="input-first-name" />
                  {form.formState.errors.firstName && (
                    <p className="text-xs text-destructive">{form.formState.errors.firstName.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" {...form.register("lastName")} data-testid="input-last-name" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="birthday">Birthday</Label>
                <Input id="birthday" type="date" {...form.register("birthday")} data-testid="input-birthday" />
              </div>
            </TabsContent>

            {/* Tags tab */}
            <TabsContent value="tags" className="space-y-5 pt-2">
              <TagPickerSection
                label="Relationship"
                allTags={allConnectionTags}
                selected={connectionTagsValue}
                onToggle={(tag) => toggleTag(connectionTagsValue, tag, "connectionTags")}
                onAdd={addConnectionTag}
                onDelete={(tag) => {
                  removeConnectionTag(tag);
                  // Also remove from this contact's selected list if present
                  form.setValue("connectionTags", connectionTagsValue.filter((t) => t !== tag));
                }}
              />

              <TagPickerSection
                label="Industry"
                allTags={allIndustryTags}
                selected={industryTagsValue}
                onToggle={(tag) => toggleTag(industryTagsValue, tag, "industryTags")}
                onAdd={addIndustryTag}
                onDelete={(tag) => {
                  removeIndustryTag(tag);
                  form.setValue("industryTags", industryTagsValue.filter((t) => t !== tag));
                }}
              />
            </TabsContent>

            {/* Contact info tab */}
            <TabsContent value="contact" className="space-y-3 pt-2">
              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground">No contact methods added yet.</p>
              )}
              {fields.map((field, i) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Select
                    value={form.watch(`contactMethods.${i}.type`)}
                    onValueChange={(v) => form.setValue(`contactMethods.${i}.type`, v)}
                  >
                    <SelectTrigger className="w-36 h-9 text-sm" data-testid={`select-contact-type-${i}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_METHOD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1 h-9 text-sm"
                    placeholder="Value…"
                    {...form.register(`contactMethods.${i}.value`)}
                    data-testid={`input-contact-value-${i}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(i)}
                    data-testid={`button-remove-contact-${i}`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => append({ type: "phone", value: "" })}
                data-testid="button-add-contact-method"
              >
                <Plus size={14} className="mr-1.5" />
                Add contact method
              </Button>
            </TabsContent>

            {/* Notes tab */}
            <TabsContent value="notes" className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Anything you'd like to remember…"
                  className="min-h-[140px] text-sm"
                  {...form.register("notes")}
                  data-testid="textarea-notes"
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save-contact">
              {mutation.isPending ? "Saving…" : mode === "edit" ? "Save changes" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
