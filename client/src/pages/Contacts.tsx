import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import type { Contact } from "@shared/schema";
import { parseJSON, tagColor, initials, avatarBg } from "@/lib/utils";
import { useTags } from "@/hooks/useTags";
import { formatDistanceToNow, parseISO, differenceInDays } from "date-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search, Users, Filter, X, Upload } from "lucide-react";
import AddContactDialog from "@/components/AddContactDialog";
import AddReminderDialog from "@/components/AddReminderDialog";
import ImportDialog from "@/components/ImportDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

function ContactAvatar({ contact, size = "md" }: { contact: Contact; size?: "sm" | "md" }) {
  const bg = avatarBg(contact.firstName + contact.lastName);
  const sz = size === "sm" ? "w-9 h-9 text-xs" : "w-11 h-11 text-sm";
  if (contact.photo) {
    return <img src={contact.photo} alt={contact.firstName} className={`${sz} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${sz} rounded-full shrink-0 flex items-center justify-center text-white font-semibold`} style={{ backgroundColor: bg }}>
      {initials(contact.firstName, contact.lastName)}
    </div>
  );
}

export default function Contacts() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterRelationship, setFilterRelationship] = useState<string>("all");
  const [filterIndustry, setFilterIndustry] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Check-in reminder auto-dialog state
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [pendingCheckIn, setPendingCheckIn] = useState<{ contactId: number; fullName: string } | null>(null);

  const today = new Date();
  const { connectionTags, industryTags } = useTags();

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    const nameMatch = `${c.firstName} ${c.lastName}`.toLowerCase().includes(q);
    if (!nameMatch) return false;

    if (filterRelationship && filterRelationship !== "all") {
      const tags = parseJSON<string[]>(c.connectionTags, []);
      if (!tags.includes(filterRelationship)) return false;
    }
    if (filterIndustry && filterIndustry !== "all") {
      const tags = parseJSON<string[]>(c.industryTags, []);
      if (!tags.includes(filterIndustry)) return false;
    }
    return true;
  });

  const hasFilters = filterRelationship !== "all" || filterIndustry !== "all" || search !== "";

  function handleContactAdded(contactId: number, fullName: string) {
    setPendingCheckIn({ contactId, fullName });
    setCheckInOpen(true);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{contacts.length} people in your network</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} data-testid="button-bulk-import">
            <Upload size={16} className="mr-1.5" />
            Bulk import
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-contact">
            <Plus size={16} className="mr-1.5" />
            Add contact
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-contacts"
          />
        </div>

        <Select value={filterRelationship} onValueChange={setFilterRelationship}>
          <SelectTrigger className="w-44 h-9 text-sm" data-testid="select-filter-relationship">
            <Filter size={14} className="mr-1.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Relationship" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All relationships</SelectItem>
            {connectionTags.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterIndustry} onValueChange={setFilterIndustry}>
          <SelectTrigger className="w-40 h-9 text-sm" data-testid="select-filter-industry">
            <Filter size={14} className="mr-1.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Industry" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All industries</SelectItem>
            {industryTags.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground"
            onClick={() => { setSearch(""); setFilterRelationship("all"); setFilterIndustry("all"); }}
          >
            <X size={13} className="mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Contact grid */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="skeleton w-11 h-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-3 w-1/2" />
                </div>
              </div>
              <div className="skeleton h-3 w-full" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <Users size={40} className="text-muted-foreground/30 mb-3" />
          {contacts.length === 0 ? (
            <>
              <h3 className="text-sm font-medium text-foreground mb-1">Your network starts here</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-xs">
                Add your first contact to start keeping track of your relationships.
              </p>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus size={16} className="mr-1.5" />
                Add first contact
              </Button>
            </>
          ) : (
            <>
              <h3 className="text-sm font-medium text-foreground mb-1">No contacts found</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your search or filters.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => {
            const connectionTags = parseJSON<string[]>(c.connectionTags, []);
            const industryTagsArr = parseJSON<string[]>(c.industryTags, []);
            const daysSince = c.lastContactedAt
              ? differenceInDays(today, parseISO(c.lastContactedAt))
              : null;
            const isOverdue = daysSince === null || daysSince > 180;

            return (
              <Card
                key={c.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => navigate(`/contacts/${c.id}`)}
                data-testid={`card-contact-${c.id}`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <ContactAvatar contact={c} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                      {c.firstName} {c.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.lastContactedAt
                        ? `Contacted ${formatDistanceToNow(parseISO(c.lastContactedAt))} ago`
                        : "Never contacted"}
                    </p>
                  </div>
                  {isOverdue && (
                    <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0 mt-1.5 overdue-pulse" title="Overdue for contact" />
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {connectionTags.slice(0, 2).map((tag) => (
                    <span key={tag} className={`tag-pill ${tagColor(tag)}`}>{tag}</span>
                  ))}
                  {industryTagsArr.slice(0, 1).map((tag) => (
                    <span key={tag} className="tag-pill bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tag}</span>
                  ))}
                  {(connectionTags.length + industryTagsArr.length) > 3 && (
                    <span className="tag-pill bg-muted text-muted-foreground">+{connectionTags.length + industryTagsArr.length - 3}</span>
                  )}
                </div>

                {c.birthday && (
                  <p className="text-xs text-muted-foreground mt-2">
                    🎂 {new Date(c.birthday + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />

      <AddContactDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onContactAdded={handleContactAdded}
      />

      {/* Auto check-in dialog after adding a contact */}
      {pendingCheckIn && (
        <AddReminderDialog
          open={checkInOpen}
          onClose={() => { setCheckInOpen(false); setPendingCheckIn(null); }}
          contactId={pendingCheckIn.contactId}
          dialogTitle="Set up a check-in reminder"
          defaultValues={{
            type: "check_in",
            title: `${pendingCheckIn.fullName} - Check In`,
            checkInAfterDays: 180,
            isRecurring: true,
          }}
        />
      )}
    </div>
  );
}
