import { Avatar, AvatarFallback } from "@ui-sdk/react/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip";
import { useEffect, useState } from "react";
import type YProvider from "y-partyserver/provider";

// Each passes 4.5:1 with white text, for the chips and the caret labels.
const palette = ["#b91c1c", "#1d4ed8", "#047857", "#c2410c", "#7e22ce", "#0f766e"];

export function userColor(userId: string): string {
  // djb2. Six colours can still collide; this one spreads the demo accounts apart.
  let hash = 5381;
  for (const char of userId) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

interface PresentUser {
  id: string;
  name: string;
  color: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function readPeople(provider: YProvider, selfId: string): PresentUser[] {
  const people = new Map<string, PresentUser>();
  for (const state of provider.awareness.getStates().values()) {
    const user: unknown = state.user;
    if (!user || typeof user !== "object" || !("id" in user) || !("name" in user)) continue;
    const { id, name } = user;
    if (typeof id !== "string" || typeof name !== "string" || id === selfId || people.has(id)) continue;
    people.set(id, { id, name, color: userColor(id) });
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function Presence({ provider, selfId }: { provider: YProvider; selfId: string }) {
  const [people, setPeople] = useState(() => readPeople(provider, selfId));

  useEffect(() => {
    const onChange = () => setPeople(readPeople(provider, selfId));
    provider.awareness.on("change", onChange);
    onChange();
    return () => provider.awareness.off("change", onChange);
  }, [provider, selfId]);

  if (people.length === 0) return null;
  return (
    <ul aria-label="People in this document" className="flex items-center gap-1">
      {people.map((person) => (
        <li key={person.id}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Avatar
                  role="img"
                  tabIndex={0}
                  aria-label={`${person.name} is here`}
                  className="size-7 rounded-full p-0 text-xs font-semibold text-white"
                  style={{ backgroundColor: person.color }}
                />
              }
            >
              <AvatarFallback aria-hidden>{initials(person.name)}</AvatarFallback>
            </TooltipTrigger>
            <TooltipContent>{person.name}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
