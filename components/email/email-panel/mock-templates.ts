import type { EmailTemplate } from './types'

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id:          'tpl-cold-1',
    name:        'Problem-First Cold Outreach',
    description: 'Opens with a relatable pain point before introducing your solution.',
    category:    'cold_outreach',
    tags:        ['cold', 'problem-aware', 'short'],
    subject:     'Quick question about outreach at {{company}}',
    body: `Hi {{first_name}},

Most outreach teams at companies like {{company}} spend hours each week manually tracking replies, following up, and personalising emails one by one.

We built Summits to eliminate that — teams using us see 3× reply rates within the first 30 days.

Would a 15-min call this week make sense? No pitch, just curious if the problem resonates.

Best,
{{sender_name}}`,
  },
  {
    id:          'tpl-cold-2',
    name:        'Compliment + Insight',
    description: 'Open with a genuine observation about their business before the ask.',
    category:    'cold_outreach',
    tags:        ['cold', 'personalised', 'medium'],
    subject:     'Noticed something about {{company}}',
    body: `Hi {{first_name}},

I came across {{company}} while researching fast-growing SaaS teams and was impressed by your product — especially [specific observation].

Teams at that stage often hit a ceiling with their outreach process. We help scale personalised email without adding headcount.

Is this something on your radar? Happy to share a quick case study.

{{sender_name}}`,
  },
  {
    id:          'tpl-follow-1',
    name:        'Soft Follow-up (2nd touch)',
    description: 'Low-pressure follow-up that adds value rather than chasing.',
    category:    'follow_up',
    tags:        ['follow-up', 'soft', 'value'],
    subject:     'Re: Quick question about outreach at {{company}}',
    body: `Hi {{first_name}},

Just circling back on my last email in case it got buried.

I put together a short 2-minute overview of how teams similar to {{company}} use Summits — happy to share if that would be useful.

No pressure either way.

Best,
{{sender_name}}`,
  },
  {
    id:          'tpl-follow-2',
    name:        'Value-Add Follow-up',
    description: 'Follow up with something concrete: a resource, case study, or insight.',
    category:    'follow_up',
    tags:        ['follow-up', 'resource', 'case-study'],
    subject:     'Something that might be useful for {{company}}',
    body: `Hi {{first_name}},

Thought you might find this useful — we just published a breakdown of how [Company X] increased their reply rate from 4% to 18% in 6 weeks using a few simple changes to their outreach workflow.

I can forward it over if you'd like.

{{sender_name}}`,
  },
  {
    id:          'tpl-demo-1',
    name:        'Demo Request',
    description: 'Direct ask for a demo with clear agenda.',
    category:    'demo_request',
    tags:        ['demo', 'direct', 'calendar'],
    subject:     '15 min to show you what we built',
    body: `Hi {{first_name}},

Would love to show you what Summits actually looks like in practice — specifically for a team like {{company}}.

The call is 15 minutes. I'll walk through:
• How we handle personalisation at scale
• The 50-email/day sending model
• Results from a similar company

Does [Day] at [Time] work, or feel free to grab time here: [calendar link]

{{sender_name}}`,
  },
  {
    id:          'tpl-breakup-1',
    name:        'Break-up Email',
    description: 'Final touch before removing from sequence. Creates urgency without pressure.',
    category:    'breakup',
    tags:        ['breakup', 'final', 'urgency'],
    subject:     'Should I close your file, {{first_name}}?',
    body: `Hi {{first_name}},

I've reached out a few times without hearing back, so I'll assume the timing isn't right.

I'll close your file for now — but if things change and you want to explore how Summits could help {{company}}, my door is always open.

Wishing you and the team a great quarter.

{{sender_name}}`,
  },
  {
    id:          'tpl-checkin-1',
    name:        'Re-engagement Check-in',
    description: 'Re-open a cold lead after 30–60 days without pressure.',
    category:    'check_in',
    tags:        ['re-engagement', 'warm', 'no-pressure'],
    subject:     'Checking in — {{company}}',
    body: `Hi {{first_name}},

Hope things are going well at {{company}}!

I'm reaching back out because we just launched [new feature / update] that I thought you'd find relevant given what we discussed.

Would it make sense to reconnect for a quick update?

{{sender_name}}`,
  },
]

export const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  cold_outreach: 'Cold Outreach',
  follow_up:     'Follow-up',
  breakup:       'Break-up',
  demo_request:  'Demo Request',
  value_prop:    'Value Prop',
  check_in:      'Check-in',
}

export const TEMPLATE_CATEGORY_COLORS: Record<string, string> = {
  cold_outreach: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  follow_up:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  breakup:       'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  demo_request:  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  value_prop:    'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  check_in:      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}
