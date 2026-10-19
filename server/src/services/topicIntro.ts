import { query } from '../db/pool';

const GROUNDING = 'Answers come only from club documents shared for this chat.';
const MAX_ASK_LENGTH = 220;

export type TopicGroup = {
  name: string;
  titles: string[];
};

export function composeTopicIntro(groups: TopicGroup[]): string {
  const named = groups
    .map((group) => ({
      name: group.name.replace(/\s+/g, ' ').trim(),
      titles: group.titles.map(cleanTitle).filter(Boolean),
    }))
    .filter((group) => group.name && group.titles.length > 0);

  if (!named.length) {
    return `Ask about the club. ${GROUNDING}`;
  }

  const categories = named.map((group) => group.name.toLowerCase());
  const examples = pickExamples(named);
  const categoryPhrase = joinList(categories);
  let ask = examples.length
    ? `Ask about ${categoryPhrase}, including ${joinList(examples)}.`
    : `Ask about ${categoryPhrase}.`;
  if (ask.length > MAX_ASK_LENGTH) {
    ask = `Ask about ${categoryPhrase}.`;
  }
  if (ask.length > MAX_ASK_LENGTH) {
    ask = `Ask about ${joinList(categories.slice(0, 4))}.`;
  }
  return `${ask} ${GROUNDING}`;
}

export async function loadTopicIntro(): Promise<string> {
  const result = await query<{ category_name: string | null; title: string }>(
    `SELECT c.name AS category_name, t.title
     FROM topics t
     LEFT JOIN categories c ON c.id = t.category_id
     ORDER BY c.sort_order NULLS LAST, c.name NULLS LAST, length(t.title), t.title`
  );

  const order: string[] = [];
  const byName = new Map<string, string[]>();
  for (const row of result.rows) {
    const name = row.category_name?.trim() || 'other topics';
    if (!byName.has(name)) {
      byName.set(name, []);
      order.push(name);
    }
    byName.get(name)!.push(row.title);
  }

  return composeTopicIntro(order.map((name) => ({ name, titles: byName.get(name) || [] })));
}

function pickExamples(groups: TopicGroup[]): string[] {
  const chosen: string[] = [];
  const used = new Set<string>();
  for (const group of groups) {
    const title = group.titles
      .map((item) => item.toLowerCase())
      .find((item) => item.length <= 42 && item !== group.name.toLowerCase() && !used.has(item));
    if (!title) continue;
    used.add(title);
    chosen.push(title);
    if (chosen.length >= 3) break;
  }
  return chosen;
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').replace(/[.]+$/g, '').trim();
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
