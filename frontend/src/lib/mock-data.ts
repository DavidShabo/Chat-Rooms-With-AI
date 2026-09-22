export type Task = {
  id: string;
  title: string;
  due: string;
  priority: "high" | "medium" | "low";
  done: boolean;
  source: "pixi" | "outlook" | "manual";
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  attendees?: number;
};

export type Email = {
  id: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
  account: "gmail" | "outlook";
};

export type Note = {
  id: string;
  body: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export const tasks: Task[] = [
  {
    id: "t1",
    title: "Review the Q3 integration spec",
    due: "Today, 4:00 PM",
    priority: "high",
    done: false,
    source: "outlook",
  },
  {
    id: "t2",
    title: "Send follow-up to the design vendor",
    due: "Today, 6:30 PM",
    priority: "high",
    done: false,
    source: "pixi",
  },
  {
    id: "t3",
    title: "Book flights for the Denver trip",
    due: "Tomorrow",
    priority: "medium",
    done: false,
    source: "manual",
  },
  {
    id: "t4",
    title: "Renew the domain registration",
    due: "Fri, Aug 8",
    priority: "medium",
    done: false,
    source: "pixi",
  },
  {
    id: "t5",
    title: "Draft the onboarding checklist",
    due: "Mon, Aug 11",
    priority: "low",
    done: false,
    source: "manual",
  },
  {
    id: "t6",
    title: "Export last month's invoices",
    due: "Yesterday",
    priority: "low",
    done: true,
    source: "pixi",
  },
];

export const events: CalendarEvent[] = [
  {
    id: "e1",
    title: "Standup",
    start: "9:00 AM",
    end: "9:15 AM",
    attendees: 6,
  },
  {
    id: "e2",
    title: "Integration architecture review",
    start: "11:00 AM",
    end: "12:00 PM",
    location: "Conf room B",
    attendees: 4,
  },
  {
    id: "e3",
    title: "Lunch with Marcus",
    start: "12:30 PM",
    end: "1:30 PM",
    location: "Nomad Cafe",
  },
  {
    id: "e4",
    title: "Vendor call — design system",
    start: "3:00 PM",
    end: "3:45 PM",
    attendees: 3,
  },
  {
    id: "e5",
    title: "Focus block — spec review",
    start: "4:00 PM",
    end: "5:30 PM",
  },
];

export const emails: Email[] = [
  {
    id: "m1",
    from: "Marcus Webb",
    subject: "Re: Integration timeline",
    preview:
      "Looks good on our end. One thing — can we push the auth piece to phase two? It'd give us room to...",
    receivedAt: "12m",
    unread: true,
    account: "gmail",
  },
  {
    id: "m2",
    from: "Stripe",
    subject: "Your August invoice is ready",
    preview:
      "Your invoice for the period Jul 1 – Jul 31 is now available. Total due: $284.00...",
    receivedAt: "1h",
    unread: true,
    account: "outlook",
  },
  {
    id: "m3",
    from: "Dana Ruiz",
    subject: "Denver trip logistics",
    preview:
      "Sent over the hotel block info. Let me know if you want me to hold a room for the extra night...",
    receivedAt: "3h",
    unread: false,
    account: "gmail",
  },
  {
    id: "m4",
    from: "GitHub",
    subject: "[pixi] 3 new pull requests",
    preview:
      "A summary of activity in your repositories over the last 24 hours...",
    receivedAt: "5h",
    unread: false,
    account: "outlook",
  },
];

export const notes: Note[] = [
  {
    id: "n1",
    body: "Backend should expose SSE for streaming — IAsyncEnumerable maps cleanly.",
    createdAt: "Today",
  },
  {
    id: "n2",
    body: "Ask Dana about the extra night in Denver before booking flights.",
    createdAt: "Yesterday",
  },
  {
    id: "n3",
    body: "Local file agent: scope to a whitelist of directories, never full disk.",
    createdAt: "Jul 29",
  },
];

export const initialMessages: ChatMessage[] = [
  {
    id: "c1",
    role: "assistant",
    content:
      "Morning. You've got 5 things on the calendar today and two tasks due before end of day. The integration spec review at 4 is the one worth protecting — want me to block prep time before it?",
    createdAt: "9:02 AM",
  },
];
