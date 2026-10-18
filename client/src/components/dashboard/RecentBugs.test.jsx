import { describe, expect, it } from 'vitest';
import { within } from '@testing-library/react';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../../tailwind.config.cjs';
import RecentBugs from './RecentBugs.jsx';
import { STATUS_OPTIONS } from '../../utils/constants.js';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

const bugWithStatus = (status, i) => ({
  _id: `b${i}`,
  title: `A ${status} bug`,
  status,
  priority: 'medium',
  project: 'Web',
  source: 'manual',
  occurrences: 1,
  assignedTo: null,
  updatedAt: new Date().toISOString(),
});

// Compiles exactly these classes with the project's real Tailwind config and
// returns the generated CSS. jsdom loads no stylesheet, so this is the only way
// a test can see whether a class actually produces a rule.
const compile = async (classes) => {
  const result = await postcss([
    tailwindcss({ ...tailwindConfig, content: [{ raw: classes.join(' ') }] }),
  ]).process('@tailwind utilities;', { from: undefined });
  return result.css;
};

describe('RecentBugs status marks', () => {
  it('renders a coloured mark for every status, and each one compiles to a real colour', async () => {
    const statuses = STATUS_OPTIONS.map((s) => s.value);
    const { container } = renderWithProviders(
      <RecentBugs bugs={statuses.map(bugWithStatus)} loading={false} />
    );

    const rows = within(container.querySelector('tbody')).getAllByRole('row');
    expect(rows).toHaveLength(statuses.length);

    const markClasses = rows.map((row, i) => {
      const cell = row.querySelectorAll('td')[1];
      const mark = cell.querySelector('[aria-hidden="true"]');
      expect(mark, `no mark for ${statuses[i]}`).not.toBeNull();
      const bg = [...mark.classList].find((c) => c.startsWith('bg-'));
      expect(bg, `mark for ${statuses[i]} has no background class`).toBeTruthy();
      return bg;
    });

    // Every status gets its own colour; a fallback would show up as a repeat.
    expect(new Set(markClasses).size).toBe(statuses.length);

    // And every one of those classes generates a background-color rule. A
    // class that names a colour key missing from the config compiles to
    // nothing, which on screen is a status with no mark at all.
    const css = await compile(markClasses);
    for (const [i, cls] of markClasses.entries()) {
      const rule = css.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`));
      expect(rule, `${cls} (${statuses[i]}) produced no CSS rule`).not.toBeNull();
      expect(rule[1]).toMatch(/background-color:\s*rgb\(var\(--/);
    }
  });
});
