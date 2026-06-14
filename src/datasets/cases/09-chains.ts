/**
 * Task-7 chains: dependent-lookup narratives. Each chain is a multi-step task where
 * every hop's time argument depends on a NAMED MILESTONE established earlier — and
 * deliberately not always the most recent one (non-adjacent references are the trap:
 * a model that always binds to "the last date mentioned" fails them).
 *
 * Per hop we author:
 *  - the instruction text the model sees at that step,
 *  - the canonical IR for the correct time argument, expressed over milestone refs
 *    (`ref('m1')` …) — the resolver computes ground truth, so hop keys are derived,
 *    never hand-typed;
 *  - `bindsTo`: which milestone the hop SHOULD anchor on, plus the resolver-computed
 *    value a wrong-but-plausible binding (each OTHER milestone) would produce — these
 *    are the labeled distractors that let scoring separate anchor-binding errors from
 *    arithmetic errors.
 *
 * Milestone bindings for the IR arm are injected into ctx.customPresets by the
 * harness, hop by hop, as concrete `iso` values under the milestone's name — the model
 * references them by name (`ref`) and never sees or computes the concrete dates.
 */
import type { TimeExpr } from '../../scate-lite/ir.js';
import { d, nth, preset, range, ref, shift, wd } from './lib/build.js';
import type { AnchorId } from './lib/types.js';

export interface ChainHop {
  /** Step instruction shown to the model (appended to the running conversation). */
  instruction: string;
  /** Which milestone the hop must anchor on ('anchor' = the chain's now). */
  bindsTo: string;
  /** Canonical IR over milestone refs — resolver-computes this hop's ground truth. */
  canonicalIR: TimeExpr;
  /** Defensible ALTERNATIVE readings (resolver-computed like the key): an answer
   *  matching one counts as within-acceptable, not a miss — the hop-level mirror of
   *  the translation slices' Sev-4 mechanism, applied to every arm symmetrically. */
  acceptable?: TimeExpr[];
  /** This hop DEFINES a new milestone (its resolved value gets bound to this name). */
  defines?: string;
}

export interface ChainItem {
  id: string;
  anchor: AnchorId;
  /** Scene-setting preamble (mentions no concrete dates — those come from resolution). */
  setup: string;
  hops: ChainHop[];
}

export const CHAINS: ChainItem[] = [
  {
    id: 'CH-01', anchor: 'A5',
    setup: 'You are investigating a service incident. The incident began on the first Monday of last month.',
    hops: [
      {
        instruction: 'Query the error logs for the day the incident began.',
        bindsTo: 'anchor', defines: 'incident_start',
        canonicalIR: nth(1, 'mon', preset('last_month')),
      },
      {
        instruction: 'Query the deploy history for the 3 days before the incident began.',
        bindsTo: 'incident_start',
        canonicalIR: range(shift(ref('incident_start'), 'P3D', 'before'), shift(ref('incident_start'), 'P1D', 'before')),
      },
      {
        instruction: 'The fix landed one week after the incident began. Query the alert volume for that day.',
        bindsTo: 'incident_start', defines: 'fix_day',
        canonicalIR: shift(ref('incident_start'), 'P1W', 'after'),
      },
      {
        instruction: 'Query the SLA report for the span from the incident beginning through the fix (inclusive).',
        bindsTo: 'incident_start', // non-adjacent: must reach PAST fix_day back to incident_start
        canonicalIR: range(ref('incident_start'), ref('fix_day')),
      },
    ],
  },
  {
    id: 'CH-02', anchor: 'A1',
    setup: 'You are preparing a quarterly business review. The review meeting is scheduled for the last business day of this month.',
    hops: [
      {
        instruction: 'Query the calendar for the review meeting day.',
        bindsTo: 'anchor', defines: 'review_day',
        canonicalIR: nth('last', 'business_day', preset('this_month')),
      },
      {
        instruction: 'Materials are due 5 business days before the review. Query the task list for the due day.',
        bindsTo: 'review_day', defines: 'materials_due',
        canonicalIR: shift(ref('review_day'), 'P5D', 'before', true),
      },
      {
        instruction: 'Query revenue for the full week (Monday through Sunday) containing the materials due date.',
        bindsTo: 'materials_due',
        canonicalIR: range(wd('mon', 'this', { of: ref('materials_due') }), wd('sun', 'this', { of: ref('materials_due') })),
      },
      {
        instruction: 'For comparison, query revenue for the same single day as the review meeting, one month earlier.',
        bindsTo: 'review_day', // non-adjacent: most recent milestone is materials_due
        canonicalIR: shift(ref('review_day'), 'P1M', 'before'),
      },
    ],
  },
  {
    id: 'CH-03', anchor: 'A2',
    setup: 'You are auditing a marketing campaign. The campaign launched on the 10th of this month and ran for two weeks.',
    hops: [
      {
        instruction: 'Query impressions for the launch day.',
        bindsTo: 'anchor', defines: 'launch',
        canonicalIR: d({ day: 10, which: 'this' }),
      },
      {
        instruction: 'Query impressions for the full campaign window (two weeks starting at launch).',
        bindsTo: 'launch', defines: 'campaign_window',
        canonicalIR: range(ref('launch'), shift(ref('launch'), 'P13D', 'after')),
      },
      {
        instruction: 'Query the baseline: the two weeks immediately before the launch.',
        bindsTo: 'launch', // non-adjacent
        canonicalIR: range(shift(ref('launch'), 'P2W', 'before'), shift(ref('launch'), 'P1D', 'before')),
      },
      {
        instruction: 'A press mention happened the Friday after the campaign ended. Query traffic for that day.',
        bindsTo: 'campaign_window',
        // weekday.of anchors on a range's FIRST day, so chain through the range's last
        // day explicitly. (Milestone renamed campaign_window after the audit: a
        // milestone NAMED "_end" holding a range misled models into binding its start.)
        canonicalIR: wd('fri', 'next', { of: nth('last', 'day', ref('campaign_window')) }),
      },
      {
        instruction: 'Finally, query conversions for the launch day one more time, for the summary table.',
        bindsTo: 'launch', // deep non-adjacent reference back to hop 1
        canonicalIR: ref('launch'),
      },
    ],
  },
  {
    id: 'CH-04', anchor: 'A4',
    setup: 'You are reconciling vendor invoices. Invoices are issued on the first business day of each month.',
    hops: [
      {
        instruction: "Query the invoice register for this month's issue day.",
        bindsTo: 'anchor', defines: 'this_issue',
        canonicalIR: nth(1, 'business_day', preset('this_month')),
      },
      {
        instruction: "Query the register for last month's issue day.",
        bindsTo: 'anchor', defines: 'prev_issue',
        canonicalIR: nth(1, 'business_day', preset('last_month')),
      },
      {
        instruction: 'Query payments received between the two issue days (from the older one through the day before the newer one).',
        bindsTo: 'prev_issue', // must combine BOTH milestones
        canonicalIR: range(ref('prev_issue'), shift(ref('this_issue'), 'P1D', 'before')),
      },
      {
        instruction: 'Payment terms are 30 days. Query the ledger for the due date of this month’s invoice.',
        bindsTo: 'this_issue', // non-adjacent
        canonicalIR: shift(ref('this_issue'), 'P30D', 'after'),
      },
    ],
  },
  {
    id: 'CH-05', anchor: 'A3',
    setup: 'You are tracking a product release. The release shipped on the second Friday of this month; a hotfix followed 4 days later.',
    hops: [
      {
        instruction: 'Query the changelog for the release day.',
        bindsTo: 'anchor', defines: 'release',
        canonicalIR: nth(2, 'fri', preset('this_month')),
      },
      {
        instruction: 'Query crash reports for the hotfix day.',
        bindsTo: 'release', defines: 'hotfix',
        canonicalIR: shift(ref('release'), 'P4D', 'after'),
      },
      {
        instruction: 'Query crash reports for the window from release through hotfix (inclusive).',
        bindsTo: 'release',
        canonicalIR: range(ref('release'), ref('hotfix')),
      },
      {
        instruction: 'Query user reviews for the 7 days starting the day after the hotfix.',
        bindsTo: 'hotfix',
        canonicalIR: range(shift(ref('hotfix'), 'P1D', 'after'), shift(ref('hotfix'), 'P7D', 'after')),
      },
      {
        instruction: 'For the release retrospective, query CI history for the business day before the release.',
        bindsTo: 'release', // deep non-adjacent
        canonicalIR: shift(ref('release'), 'P1D', 'before', true),
      },
    ],
  },
  {
    id: 'CH-06', anchor: 'A6',
    setup: 'You are closing the books for the year. The close process starts on the last business day of the year.',
    hops: [
      {
        instruction: 'Query the close-checklist for the close start day.',
        bindsTo: 'anchor', defines: 'close_start',
        canonicalIR: nth('last', 'business_day', preset('this_year')),
      },
      {
        instruction: 'Query the trial balance for the full quarter that contains the close start day.',
        bindsTo: 'close_start',
        canonicalIR: preset('this_quarter'),
      },
      {
        instruction: 'Auditors arrive 10 business days after the close starts. Query the calendar for their arrival day.',
        bindsTo: 'close_start', defines: 'audit_day',
        canonicalIR: shift(ref('close_start'), 'P10D', 'after', true),
      },
    ],
  },

  // ── hardening wave (added after the first run showed flat drift on the easy set):
  // implicit references, mid-chain redefinition, distractor dates, depth 8 ──
  {
    id: 'CH-07', anchor: 'A1',
    setup: 'You are doing a post-launch review. The new pricing page went live on the first business day of this month. (Background, not needed for queries: the company was founded on June 3, 2019, and the pricing team formed on the 20th of last month.)',
    hops: [
      {
        instruction: 'Query page views for the day it went live.',
        bindsTo: 'anchor', defines: 'go_live',
        canonicalIR: nth(1, 'business_day', preset('this_month')),
      },
      {
        instruction: 'Pull sign-ups for the first full week after that.',
        bindsTo: 'go_live', defines: 'week_one',
        // implicit reference ("that") + week composition. RE-KEYED after the run audit:
        // "first FULL week after" a Monday go-live naturally means the next Mon–Sun
        // week (12/15 model answers agreed); the original 7-days-from-Tuesday key was
        // the unnatural reading.
        canonicalIR: range(wd('mon', 'next', { of: ref('go_live') }), shift(wd('mon', 'next', { of: ref('go_live') }), 'P6D', 'after')),
        acceptable: [
          // Sun-start full week
          range(wd('sun', 'next', { of: ref('go_live') }), shift(wd('sun', 'next', { of: ref('go_live') }), 'P6D', 'after')),
          // "the (7-day) week after" reading
          range(shift(ref('go_live'), 'P1D', 'after'), shift(ref('go_live'), 'P7D', 'after')),
        ],
      },
      {
        instruction: 'Now the comparable window right before things changed — same length, ending the day before.',
        bindsTo: 'go_live',
        // fully implicit: "things changed" = go-live; mirror window
        canonicalIR: range(shift(ref('go_live'), 'P7D', 'before'), shift(ref('go_live'), 'P1D', 'before')),
      },
      {
        instruction: 'Support tickets spiked two days in. Query tickets for that single day.',
        bindsTo: 'go_live', defines: 'spike_day',
        canonicalIR: shift(ref('go_live'), 'P2D', 'after'),
      },
      {
        instruction: 'Query the on-call roster for the day the page went live, for the incident timeline.',
        bindsTo: 'go_live', // named again, but 3 hops back with distractor dates in setup
        canonicalIR: ref('go_live'),
      },
    ],
  },
  {
    id: 'CH-08', anchor: 'A5',
    setup: 'You are coordinating a board meeting. It was originally scheduled for the second Tuesday of next month.',
    hops: [
      {
        instruction: 'Query the room bookings for the meeting day.',
        bindsTo: 'anchor', defines: 'meeting',
        canonicalIR: nth(2, 'tue', preset('next_month')),
      },
      {
        instruction: 'Pre-reads are due 3 business days before the meeting. Query the document tracker for the due day.',
        bindsTo: 'meeting',
        canonicalIR: shift(ref('meeting'), 'P3D', 'before', true),
      },
      {
        instruction: 'Update: the meeting has been MOVED one week later. Query room bookings for the new meeting day.',
        bindsTo: 'meeting', defines: 'meeting', // REDEFINES the milestone
        canonicalIR: shift(ref('meeting'), 'P1W', 'after'),
      },
      {
        instruction: 'Query the document tracker again: pre-reads are still due 3 business days before the meeting.',
        bindsTo: 'meeting', // must use the UPDATED meeting — stale-value trap
        canonicalIR: shift(ref('meeting'), 'P3D', 'before', true),
      },
      {
        instruction: 'Query the catering schedule for the day before the meeting.',
        bindsTo: 'meeting', // still the updated one
        canonicalIR: shift(ref('meeting'), 'P1D', 'before'),
      },
    ],
  },
  {
    id: 'CH-09', anchor: 'A2',
    setup: 'You are reviewing a support escalation. The customer signed their contract on the 3rd of last month, filed a ticket on the 22nd of last month, and escalated 4 business days after filing. Their renewal is on the 3rd of next month.',
    hops: [
      {
        instruction: 'Query the ticket system for the day the ticket was filed.',
        bindsTo: 'anchor', defines: 'filed',
        canonicalIR: d({ day: 22, which: 'previous' }),
      },
      {
        instruction: 'Query the escalation log for the day it escalated.',
        bindsTo: 'filed', defines: 'escalated',
        canonicalIR: shift(ref('filed'), 'P4D', 'after', true),
      },
      {
        instruction: 'Pull all account activity from the ticket through the escalation (inclusive).',
        bindsTo: 'filed', // distractors: contract day (3rd last month) + renewal (3rd next month)
        canonicalIR: range(ref('filed'), ref('escalated')),
      },
      {
        instruction: 'Query the account health snapshot for one week before the ticket was filed.',
        bindsTo: 'filed',
        canonicalIR: shift(ref('filed'), 'P1W', 'before'),
        // span reading: "the week leading up to the filing"
        acceptable: [{ type: 'range', from: shift(ref('filed'), 'P1W', 'before'), to: shift(ref('filed'), 'P1D', 'before') }],
      },
    ],
  },
  {
    id: 'CH-10', anchor: 'A3',
    setup: 'You are assembling a year-in-review for the engineering org. Work from these reference points as they come up.',
    hops: [
      {
        instruction: 'The platform migration kicked off on the second Monday of last month. Query the migration tracker for that day.',
        bindsTo: 'anchor', defines: 'migration_start',
        canonicalIR: nth(2, 'mon', preset('last_month')),
      },
      {
        instruction: 'Query deploy counts for the two weeks starting at the kickoff.',
        bindsTo: 'migration_start', defines: 'migration_window',
        // endExclusive: "two weeks starting X" is 14 days — the natural P14D encoding
        // needs the exclusive end (the same trap we measured models hitting).
        canonicalIR: { type: 'range', from: ref('migration_start'), to: { type: 'shift', base: ref('migration_start'), by: 'P14D', direction: 'after' }, endExclusive: true },
      },
      {
        instruction: 'The freeze ended 3 business days after the migration window closed. Query the calendar for the unfreeze day.',
        bindsTo: 'migration_window', defines: 'unfreeze',
        canonicalIR: shift(nth('last', 'day', ref('migration_window')), 'P3D', 'after', true),
        // boundary reading: "closed" = the window's exclusive end day (Dec 22), not its
        // last covered day — both defensible for an underspecified phrase.
        acceptable: [{ type: 'shift', base: { type: 'shift', base: nth('last', 'day', ref('migration_window')), by: 'P1D', direction: 'after' }, by: 'P3D', direction: 'after', businessDays: true }],
      },
      {
        instruction: 'Query incident counts for the unfreeze week (Monday through Sunday containing it).',
        bindsTo: 'unfreeze',
        canonicalIR: range(wd('mon', 'this', { of: ref('unfreeze') }), wd('sun', 'this', { of: ref('unfreeze') })),
      },
      {
        instruction: 'Query the hiring dashboard for the quarter that contains the migration kickoff.',
        bindsTo: 'migration_start', // 4 hops back
        canonicalIR: preset('last_quarter'),
      },
      {
        instruction: 'Retro is scheduled 2 weeks after the unfreeze. Query the calendar for the retro day.',
        bindsTo: 'unfreeze', defines: 'retro',
        canonicalIR: shift(ref('unfreeze'), 'P2W', 'after'),
      },
      {
        instruction: 'Pull the survey results for the 5 business days before the retro.',
        bindsTo: 'retro',
        canonicalIR: range(shift(ref('retro'), 'P5D', 'before', true), shift(ref('retro'), 'P1D', 'before', true)),
      },
      {
        instruction: 'Finally, for the title slide: query the metrics rollup for the day the migration kicked off.',
        bindsTo: 'migration_start', // depth-8 reference back to hop 1
        canonicalIR: ref('migration_start'),
      },
    ],
  },
];
