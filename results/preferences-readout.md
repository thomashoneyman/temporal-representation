# Preference grid — which reading does each model choose?

ISO arm only · tier mini · 5 reps · prompt db02a7503e85

Cell format: `dominantReading n/total` (ties / scattered → listed). `other` = a reading outside the candidate set (inspect raw rows).

## "last week"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | — | priorMonWeek=rolling7ExclToday 5/5 | — | priorMonWeek=rolling7ExclToday 5/5 |
| weekWednesday | priorMonWeek 3/3 | priorMonWeek 3/5 · priorSunWeek 2/5 | priorMonWeek 3/3 | priorMonWeek 5/5 |
| weekSunday | priorMonWeek 3/3 | priorSunWeek=rolling7ExclToday 3/5 · priorMonWeek 2/5 | priorMonWeek 2/3 · priorSunWeek=rolling7ExclToday 1/3 | priorMonWeek 3/5 · priorSunWeek=rolling7ExclToday 2/5 |
| monthFirst | priorMonWeek 3/3 | priorMonWeek 3/5 · priorSunWeek 2/5 | priorMonWeek 3/3 | priorMonWeek 5/5 |
| monthLast | priorMonWeek 3/3 | priorSunWeek 4/5 | priorMonWeek 3/3 | priorMonWeek 5/5 |
| quarterEnd | priorMonWeek 3/3 | priorSunWeek 3/5 · priorMonWeek 2/5 | priorMonWeek 3/3 | priorMonWeek 5/5 |
| yearStart | priorMonWeek 3/3 | priorMonWeek 3/5 | priorMonWeek 3/3 | priorMonWeek 5/5 |

## "this week"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | monWeek=next7 3/3 | monWeek=next7 3/5 · sunWeek 2/5 | monWeek=next7 3/3 | monWeek=next7 5/5 |
| weekWednesday | monWeek 3/3 | sunWeek 4/5 | sunWeek 2/3 · monWeek 1/3 | monWeek 5/5 |
| weekSunday | sunWeek=next7 2/3 · monWeek=weekToDate 1/3 | sunWeek=next7 3/5 · monWeek=weekToDate 2/5 | sunWeek=next7 3/3 | sunWeek=next7 5/5 |
| monthFirst | monWeek 3/3 | sunWeek 4/5 | monWeek 3/3 | sunWeek 3/5 · monWeek 2/5 |
| monthLast | monWeek 3/3 | sunWeek 3/5 · monWeek 2/5 | monWeek 3/3 | monWeek 3/5 · sunWeek 2/5 |
| quarterEnd | monWeek 3/3 | sunWeek 4/5 | monWeek 3/3 | monWeek 3/5 · sunWeek 2/5 |
| yearStart | monWeek 3/3 | sunWeek 3/5 · monWeek 2/5 | sunWeek 2/3 · monWeek 1/3 | sunWeek 3/5 · monWeek 2/5 |

## "the past week"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | rolling7ToNow 3/3 | rolling7ExclToday=priorMonWeek 4/5 | rolling7ToNow 3/3 | rolling7ToNow 5/5 |
| weekWednesday | countBack7InclToday 3/3 | rolling7ExclToday 3/5 | rolling7ToNow 3/3 | rolling7ToNow 5/5 |
| weekSunday | countBack7InclToday 3/3 | rolling7ExclToday 3/5 · rolling7InclToday 2/5 | rolling7ToNow 3/3 | rolling7ToNow 5/5 |
| monthFirst | countBack7InclToday 3/3 | rolling7ExclToday 3/5 | rolling7ToNow 3/3 | rolling7ToNow 5/5 |
| monthLast | countBack7InclToday 3/3 | countBack7InclToday 5/5 | rolling7ToNow 3/3 | rolling7ToNow 5/5 |
| quarterEnd | countBack7InclToday 3/3 | countBack7InclToday 4/5 | rolling7ToNow 3/3 | rolling7ToNow 5/5 |
| yearStart | countBack7InclToday 3/3 | rolling7ExclToday 3/5 · countBack7InclToday 2/5 | rolling7ToNow 3/3 | rolling7ToNow 5/5 |

## "last month"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | — | priorCalendarMonth 5/5 | — | priorCalendarMonth 5/5 |
| weekWednesday | — | priorCalendarMonth 5/5 | — | priorCalendarMonth 5/5 |
| weekSunday | — | priorCalendarMonth 5/5 | — | priorCalendarMonth 5/5 |
| monthFirst | — | priorCalendarMonth=rolling30ExclToday=rollingCalMonthBack 5/5 | — | priorCalendarMonth=rolling30ExclToday=rollingCalMonthBack 5/5 |
| monthLast | priorCalendarMonth 2/3 · other 1/3 | priorCalendarMonth 5/5 | priorCalendarMonth 2/3 · other 1/3 | priorCalendarMonth 4/5 |
| quarterEnd | — | priorCalendarMonth 5/5 | — | priorCalendarMonth 5/5 |
| yearStart | — | priorCalendarMonth 5/5 | — | priorCalendarMonth 5/5 |

## "this month"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | — | calendarMonth 5/5 | — | calendarMonth 5/5 |
| weekWednesday | — | calendarMonth 5/5 | — | calendarMonth 5/5 |
| weekSunday | — | calendarMonth 5/5 | — | calendarMonth 5/5 |
| monthFirst | — | calendarMonth 5/5 | — | calendarMonth 5/5 |
| monthLast | — | calendarMonth=monthToDate 5/5 | — | calendarMonth=monthToDate 5/5 |
| quarterEnd | — | calendarMonth=monthToDate 5/5 | — | calendarMonth=monthToDate 5/5 |
| yearStart | — | calendarMonth 5/5 | — | calendarMonth 5/5 |

## "the past month"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | rollingToNow 2/3 · rollingInclToday 1/3 | priorCalendarMonth 4/5 | rollingToNow 3/3 | rollingToNow 5/5 |
| weekWednesday | rollingInclToday 2/3 · rollingCalMonthBack 1/3 | priorCalendarMonth 5/5 | rollingToNow 3/3 | rollingToNow 5/5 |
| weekSunday | rollingInclToday 3/3 | priorCalendarMonth 3/5 · rollingInclToday 2/5 | rollingToNow 3/3 | rollingToNow 5/5 |
| monthFirst | rollingInclToday 2/3 · rollingToNow 1/3 | rollingCalMonthBack=rolling30ExclToday=priorCalendarMonth 5/5 | rollingToNow 3/3 | rollingToNow 4/5 |
| monthLast | rollingInclToday 3/3 | monthToDate 4/5 | rollingToNow 3/3 | rollingToNow 5/5 |
| quarterEnd | rollingToNow 2/3 · rollingInclToday 1/3 | monthToDate 4/5 | rollingToNow 3/3 | rollingToNow 5/5 |
| yearStart | rollingInclToday 2/3 · rollingToNow 1/3 | priorCalendarMonth 5/5 | rollingToNow 3/3 | rollingToNow 5/5 |

## "the last 30 days"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | countBack30InclToday 2/3 · toNow 1/3 | countBack30InclToday 5/5 | toNow 3/3 | toNow 5/5 |
| weekWednesday | countBack30InclToday 2/3 · toNow 1/3 | countBack30InclToday 5/5 | toNow 3/3 | toNow 5/5 |
| weekSunday | countBack30InclToday 3/3 | countBack30InclToday 5/5 | toNow 3/3 | toNow 5/5 |
| monthFirst | countBack30InclToday 3/3 | toNow 2/5 · exclToday 2/5 · countBack30InclToday 1/5 | toNow 3/3 | toNow 5/5 |
| monthLast | countBack30InclToday 3/3 | other 2/5 · countBack30InclToday 2/5 · inclToday 1/5 | toNow 3/3 | toNow 5/5 |
| quarterEnd | countBack30InclToday 3/3 | countBack30InclToday 3/5 · inclToday 2/5 | toNow 3/3 | toNow 5/5 |
| yearStart | countBack30InclToday 3/3 | countBack30InclToday 4/5 | toNow 3/3 | toNow 5/5 |

## "last quarter"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | priorCalendarQuarter 3/3 | priorCalendarQuarter 5/5 | priorCalendarQuarter 3/3 | priorCalendarQuarter 4/5 |
| weekWednesday | — | priorCalendarQuarter 5/5 | — | priorCalendarQuarter 5/5 |
| weekSunday | — | priorCalendarQuarter 5/5 | — | priorCalendarQuarter 5/5 |
| monthFirst | — | priorCalendarQuarter=rolling3Months 5/5 | — | priorCalendarQuarter=rolling3Months 5/5 |
| monthLast | — | priorCalendarQuarter 5/5 | — | priorCalendarQuarter 5/5 |
| quarterEnd | priorCalendarQuarter 3/3 | priorCalendarQuarter 5/5 | priorCalendarQuarter 3/3 | priorCalendarQuarter 4/5 |
| yearStart | — | priorCalendarQuarter 5/5 | — | priorCalendarQuarter 5/5 |

## "this quarter"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | — | calendarQuarter 5/5 | — | calendarQuarter 5/5 |
| weekWednesday | — | calendarQuarter 5/5 | — | calendarQuarter 5/5 |
| weekSunday | — | calendarQuarter 5/5 | — | calendarQuarter 5/5 |
| monthFirst | — | calendarQuarter 5/5 | — | calendarQuarter 5/5 |
| monthLast | — | calendarQuarter 5/5 | — | calendarQuarter 5/5 |
| quarterEnd | — | calendarQuarter=quarterToDate 5/5 | — | calendarQuarter=quarterToDate 5/5 |
| yearStart | calendarQuarter 3/3 | calendarQuarter 5/5 | calendarQuarter 3/3 | calendarQuarter 3/5 · other 2/5 |

## "year to date"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | other 2/3 · inclToday 1/3 | inclToday 4/5 | toInstant 3/3 | toInstant 5/5 |
| weekWednesday | other 2/3 · toInstant 1/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |
| weekSunday | other 2/3 · toInstant 1/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |
| monthFirst | other 2/3 · toInstant 1/3 | inclToday 5/5 | toInstant 3/3 | toInstant 4/5 |
| monthLast | other 3/3 | inclToday 5/5 | toInstant 3/3 | toInstant 4/5 |
| quarterEnd | other 3/3 | inclToday 5/5 | toInstant 3/3 | toInstant 4/5 |
| yearStart | toInstant 2/3 · inclToday 1/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |

## "this year"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | calendarYear 3/3 | calendarYear 5/5 | calendarYear 3/3 | calendarYear 3/5 · other 2/5 |
| weekWednesday | — | calendarYear 5/5 | — | calendarYear 5/5 |
| weekSunday | — | calendarYear 5/5 | — | calendarYear 5/5 |
| monthFirst | calendarYear 3/3 | calendarYear 5/5 | calendarYear 3/3 | calendarYear 4/5 |
| monthLast | — | calendarYear 5/5 | — | calendarYear 5/5 |
| quarterEnd | calendarYear 3/3 | calendarYear 5/5 | calendarYear 3/3 | calendarYear 4/5 |
| yearStart | — | calendarYear 5/5 | — | calendarYear 5/5 |

## "last year"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | priorCalendarYear 3/3 | priorCalendarYear 5/5 | priorCalendarYear 3/3 | priorCalendarYear 4/5 |
| weekWednesday | — | priorCalendarYear 5/5 | — | priorCalendarYear 5/5 |
| weekSunday | priorCalendarYear 3/3 | priorCalendarYear 5/5 | priorCalendarYear 3/3 | priorCalendarYear 4/5 |
| monthFirst | priorCalendarYear 3/3 | priorCalendarYear 5/5 | priorCalendarYear 3/3 | other 3/5 · priorCalendarYear 2/5 |
| monthLast | — | priorCalendarYear 5/5 | — | priorCalendarYear 5/5 |
| quarterEnd | — | priorCalendarYear 5/5 | — | priorCalendarYear 5/5 |
| yearStart | — | priorCalendarYear 5/5 | — | priorCalendarYear 5/5 |

## "this weekend"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | — | thisWeekSatSun 5/5 | — | thisWeekSatSun 5/5 |
| weekWednesday | — | thisWeekSatSun 5/5 | — | thisWeekSatSun 5/5 |
| weekSunday | thisWeekSatSun 3/3 | thisWeekSatSun 4/5 | thisWeekSatSun 3/3 | thisWeekSatSun 5/5 |
| monthFirst | — | thisWeekSatSun 5/5 | — | thisWeekSatSun 5/5 |
| monthLast | — | thisWeekSatSun 5/5 | — | thisWeekSatSun 5/5 |
| quarterEnd | — | thisWeekSatSun 5/5 | — | thisWeekSatSun 5/5 |
| yearStart | — | thisWeekSatSun 5/5 | — | thisWeekSatSun 5/5 |

## "last weekend"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | — | priorWeekSatSun 5/5 | — | priorWeekSatSun 5/5 |
| weekWednesday | — | priorWeekSatSun 5/5 | — | priorWeekSatSun 5/5 |
| weekSunday | — | priorWeekSatSun 5/5 | — | priorWeekSatSun 5/5 |
| monthFirst | — | priorWeekSatSun 5/5 | — | priorWeekSatSun 5/5 |
| monthLast | — | priorWeekSatSun 5/5 | — | priorWeekSatSun 5/5 |
| quarterEnd | — | priorWeekSatSun 5/5 | — | priorWeekSatSun 5/5 |
| yearStart | priorWeekSatSun 3/3 | priorWeekSatSun 3/5 · other 2/5 | priorWeekSatSun 3/3 | priorWeekSatSun 5/5 |

## "the end of the month"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | finalWeek 3/3 | lastDay=lastBusinessDay 4/5 | lastDay=lastBusinessDay 3/3 | lastDay=lastBusinessDay 4/5 |
| weekWednesday | — | lastDay=lastBusinessDay 5/5 | — | lastDay=lastBusinessDay 5/5 |
| weekSunday | finalWeek 3/3 | lastDay=lastBusinessDay 5/5 | lastDay=lastBusinessDay 3/3 | lastDay=lastBusinessDay 4/5 |
| monthFirst | — | lastDay=lastBusinessDay 5/5 | — | lastDay=lastBusinessDay 5/5 |
| monthLast | — | lastDay=lastBusinessDay 5/5 | — | lastDay=lastBusinessDay 5/5 |
| quarterEnd | lastDay=lastBusinessDay 3/3 | lastDay=lastBusinessDay 4/5 | lastDay=lastBusinessDay 3/3 | lastDay=lastBusinessDay 5/5 |
| yearStart | finalWeek 3/3 | lastDay 5/5 | lastDay 3/3 | lastDay 4/5 |

## "a week ago"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | dayMinus7 3/3 | instantMinus7 4/5 | instantMinus7 3/3 | instantMinus7 5/5 |
| weekWednesday | dayMinus7 2/3 · instantMinus7 1/3 | instantMinus7 4/5 | instantMinus7 3/3 | instantMinus7 5/5 |
| weekSunday | — | instantMinus7 5/5 | — | instantMinus7 5/5 |
| monthFirst | dayMinus7 2/3 · instantMinus7 1/3 | instantMinus7 4/5 | instantMinus7 3/3 | instantMinus7 5/5 |
| monthLast | — | instantMinus7 5/5 | — | instantMinus7 5/5 |
| quarterEnd | dayMinus7 2/3 · instantMinus7 1/3 | instantMinus7 4/5 | instantMinus7 3/3 | instantMinus7 5/5 |
| yearStart | — | instantMinus7 5/5 | — | instantMinus7 5/5 |

## "two weeks ago"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | dayMinus14 3/3 | instantMinus14 3/5 · dayMinus14 2/5 | instantMinus14 3/3 | instantMinus14 3/5 · dayMinus14 2/5 |
| weekWednesday | dayMinus14 3/3 | instantMinus14 4/5 | instantMinus14 3/3 | instantMinus14 4/5 |
| weekSunday | dayMinus14 3/3 | instantMinus14 3/5 · dayMinus14 2/5 | instantMinus14 3/3 | instantMinus14 3/5 · dayMinus14 2/5 |
| monthFirst | — | instantMinus14 5/5 | — | instantMinus14 5/5 |
| monthLast | dayMinus14 3/3 | instantMinus14 3/5 · dayMinus14 2/5 | instantMinus14 3/3 | instantMinus14 3/5 · dayMinus14 2/5 |
| quarterEnd | dayMinus14 3/3 | instantMinus14 3/5 · dayMinus14 2/5 | instantMinus14 3/3 | instantMinus14 4/5 |
| yearStart | dayMinus14 3/3 | instantMinus14 4/5 | instantMinus14 3/3 | instantMinus14 3/5 · dayMinus14 2/5 |

## "the last few days"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | rolling3InclToday 3/3 | rolling3InclToday 4/5 | rolling3InclToday 3/3 | rolling3InclToday 5/5 |
| weekWednesday | — | rolling3InclToday 5/5 | — | rolling3InclToday 5/5 |
| weekSunday | — | rolling3InclToday 5/5 | — | rolling3InclToday 5/5 |
| monthFirst | — | rolling3InclToday 5/5 | — | rolling3InclToday 5/5 |
| monthLast | rolling3InclToday 3/3 | rolling3InclToday 4/5 | rolling3InclToday 3/3 | rolling3InclToday 5/5 |
| quarterEnd | — | rolling3InclToday 5/5 | — | rolling3InclToday 5/5 |
| yearStart | — | rolling3InclToday 5/5 | — | rolling3InclToday 5/5 |

## "the last 90 days"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | countBack90InclToday 3/3 | countBack90InclToday 3/5 | toNow 3/3 | toNow 5/5 |
| weekWednesday | countBack90InclToday 3/3 | countBack90InclToday 4/5 | toNow 3/3 | toNow 5/5 |
| weekSunday | countBack90InclToday 3/3 | countBack90InclToday 5/5 | toNow 3/3 | toNow 5/5 |
| monthFirst | countBack90InclToday 3/3 | countBack90InclToday 5/5 | toNow 3/3 | toNow 5/5 |
| monthLast | countBack90InclToday 3/3 | countBack90InclToday 3/5 · inclToday 2/5 | toNow 2/3 · countBack90InclToday 1/3 | countBack90InclToday 3/5 · toNow 2/5 |
| quarterEnd | countBack90InclToday 3/3 | countBack90InclToday 4/5 | toNow 3/3 | toNow 4/5 |
| yearStart | countBack90InclToday 3/3 | exclToday 2/5 · inclToday 1/5 · countBack90InclToday 1/5 · toNow 1/5 | toNow 2/3 · other 1/3 | toNow 3/5 · other 2/5 |

## "the past 24 hours"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | other 3/3 | toNow 3/5 · other 2/5 | toNow 3/3 | toNow 5/5 |
| weekWednesday | other 3/3 | toNow 4/5 | toNow 3/3 | toNow 5/5 |
| weekSunday | other 3/3 | toNow 4/5 | toNow 3/3 | toNow 5/5 |
| monthFirst | other 3/3 | toNow 4/5 | toNow 3/3 | toNow 5/5 |
| monthLast | other 3/3 | toNow 4/5 | toNow 3/3 | toNow 5/5 |
| quarterEnd | other 3/3 | toNow 3/5 · other 2/5 | toNow 3/3 | toNow 5/5 |
| yearStart | other 3/3 | other 3/5 · toNow 2/5 | toNow 3/3 | toNow 5/5 |

## "month to date"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | toInstant 3/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |
| weekWednesday | toInstant 3/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |
| weekSunday | toInstant 3/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |
| monthFirst | toInstant 3/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |
| monthLast | toInstant 2/3 · inclToday 1/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |
| quarterEnd | toInstant 3/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |
| yearStart | inclToday 2/3 · toInstant 1/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |

## "quarter to date"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | toInstant 2/3 · inclToday 1/3 | inclToday 4/5 | toInstant 3/3 | toInstant 5/5 |
| weekWednesday | toInstant 3/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |
| weekSunday | inclToday 2/3 · toInstant 1/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |
| monthFirst | inclToday 2/3 · toInstant 1/3 | inclToday 4/5 | toInstant 3/3 | toInstant 5/5 |
| monthLast | toInstant 2/3 · inclToday 1/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |
| quarterEnd | toInstant 3/3 | inclToday 4/5 | toInstant 3/3 | toInstant 5/5 |
| yearStart | toInstant 2/3 · inclToday 1/3 | inclToday 5/5 | toInstant 3/3 | toInstant 5/5 |

## "so far this week"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | monWeekToInstant 3/3 | sunWeekInclToday 2/5 · other 2/5 · monWeekToInstant 1/5 | monWeekToInstant 3/3 | monWeekToInstant 5/5 |
| weekWednesday | monWeekToInstant 3/3 | sunWeekInclToday 4/5 | monWeekToInstant 3/3 | monWeekToInstant 5/5 |
| weekSunday | monWeekToInstant 3/3 | other 3/5 · monWeekToInstant 2/5 | other 2/3 · monWeekToInstant 1/3 | monWeekToInstant 4/5 |
| monthFirst | monWeekToInstant 3/3 | sunWeekInclToday 4/5 | monWeekToInstant 3/3 | monWeekToInstant 4/5 |
| monthLast | monWeekToInstant 1/3 · sunWeekInclToday 1/3 · other 1/3 | sunWeekInclToday 5/5 | monWeekToInstant 2/3 · sunWeekInclToday 1/3 | monWeekToInstant 4/5 |
| quarterEnd | monWeekToInstant 3/3 | sunWeekInclToday 5/5 | monWeekToInstant 3/3 | monWeekToInstant 5/5 |
| yearStart | monWeekToInstant 2/3 · other 1/3 | sunWeekInclToday 3/5 | monWeekToInstant 2/3 · sunWeekInclToday 1/3 | monWeekToInstant 5/5 |

## "next week"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | — | nextMonWeek 5/5 | — | nextMonWeek 5/5 |
| weekWednesday | nextMonWeek 3/3 | nextMonWeek 4/5 | nextMonWeek 3/3 | nextMonWeek 5/5 |
| weekSunday | — | nextMonWeek=rolling7Forward 5/5 | — | nextMonWeek=rolling7Forward 5/5 |
| monthFirst | nextMonWeek 3/3 | nextMonWeek 4/5 | nextMonWeek 3/3 | nextMonWeek 5/5 |
| monthLast | nextMonWeek 3/3 | nextMonWeek 4/5 | nextMonWeek 3/3 | nextMonWeek 5/5 |
| quarterEnd | — | nextMonWeek 5/5 | — | nextMonWeek 5/5 |
| yearStart | nextMonWeek 3/3 | nextMonWeek 4/5 | nextMonWeek 3/3 | nextMonWeek 5/5 |

## "next month"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | nextCalendarMonth 3/3 | nextCalendarMonth 5/5 | nextCalendarMonth 3/3 | nextCalendarMonth 4/5 |
| weekWednesday | — | nextCalendarMonth 5/5 | — | nextCalendarMonth 5/5 |
| weekSunday | — | nextCalendarMonth 5/5 | — | nextCalendarMonth 5/5 |
| monthFirst | — | nextCalendarMonth 5/5 | — | nextCalendarMonth 5/5 |
| monthLast | — | nextCalendarMonth=rollingMonthFromTomorrow 5/5 | — | nextCalendarMonth=rollingMonthFromTomorrow 5/5 |
| quarterEnd | — | nextCalendarMonth=rollingMonthFromTomorrow 5/5 | — | nextCalendarMonth=rollingMonthFromTomorrow 5/5 |
| yearStart | — | nextCalendarMonth 5/5 | — | nextCalendarMonth 5/5 |

## "the trailing twelve months"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | toNow 2/3 · rolling12Months=rolling365 1/3 | rolling12Months=rolling365 3/5 | toNow 3/3 | toNow 5/5 |
| weekWednesday | toNow 2/3 · rolling12Months=rolling365 1/3 | countBack12MonthsInclToday 3/5 | toNow 3/3 | toNow 5/5 |
| weekSunday | countBack12MonthsInclToday 2/3 · rolling12Months=rolling365 1/3 | countBack12MonthsInclToday 5/5 | toNow 3/3 | toNow 5/5 |
| monthFirst | toNow 2/3 · countBack12MonthsInclToday 1/3 | rolling12Months=last12CompleteMonths=rolling365 4/5 | toNow 3/3 | toNow 5/5 |
| monthLast | countBack12MonthsInclToday 2/3 · toNow 1/3 | countBack12MonthsInclToday 5/5 | toNow 3/3 | toNow 5/5 |
| quarterEnd | countBack12MonthsInclToday 3/3 | countBack12MonthsInclToday 4/5 | toNow 3/3 | toNow 5/5 |
| yearStart | toNow 1/3 · countBack12MonthsInclToday 1/3 · rolling12Months=rolling365 1/3 | rolling12Months=rolling365 3/5 | toNow 3/3 | toNow 5/5 |

## "the beginning of the month"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | thisMonthFirstWeek 3/3 | thisMonthFirstDay 2/5 · other 2/5 · thisMonthFirstWeek 1/5 | thisMonthFirstDay 2/3 · other 1/3 | thisMonthFirstDay 4/5 |
| weekWednesday | thisMonthFirstWeek 3/3 | thisMonthFirstDay 4/5 | thisMonthFirstDay 3/3 | thisMonthFirstDay 4/5 |
| weekSunday | thisMonthFirstWeek 3/3 | thisMonthFirstDay 4/5 | thisMonthFirstDay 3/3 | thisMonthFirstDay 4/5 |
| monthFirst | thisMonthFirstWeek 2/3 · other 1/3 | thisMonthFirstWeek 2/5 · thisMonthFirstDay 2/5 · other 1/5 | other 2/3 · thisMonthFirstDay 1/3 | thisMonthFirstDay 4/5 |
| monthLast | thisMonthFirstWeek 3/3 | thisMonthFirstDay 4/5 | thisMonthFirstDay 3/3 | thisMonthFirstDay 4/5 |
| quarterEnd | thisMonthFirstWeek 2/3 · other 1/3 | thisMonthFirstDay 3/5 · thisMonthFirstWeek 2/5 | thisMonthFirstDay 3/3 | thisMonthFirstDay 4/5 |
| yearStart | thisMonthFirstWeek 3/3 | thisMonthFirstWeek 4/5 | thisMonthFirstDay 3/3 | other 4/5 |

## "by the end of the week"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | instantToSunday 2/3 · sundayEodPoint 1/3 | nowToFriday 3/5 | other 2/3 · sundayEodPoint 1/3 | sundayEodPoint 2/5 · sundayPoint 2/5 · other 1/5 |
| weekWednesday | instantToSunday 2/3 · other 1/3 | other 2/5 · nowToFriday 2/5 · nowToSunday 1/5 | other 2/3 · instantToSunday 1/3 | sundayEodPoint 3/5 · other 2/5 |
| weekSunday | — | other 5/5 | — | other 5/5 |
| monthFirst | instantToSunday 3/3 | other 2/5 · nowToFriday 2/5 · instantToSunday 1/5 | other 2/3 · instantToSunday 1/3 | other 2/5 · sundayEodPoint 2/5 · sundayPoint 1/5 |
| monthLast | instantToSunday 3/3 | other 3/5 | sundayEodPoint 2/3 · other 1/3 | sundayEodPoint 3/5 |
| quarterEnd | instantToSunday 3/3 | other 2/5 · instantToSunday 1/5 · nowToFriday 1/5 · nowToSunday 1/5 | other 3/3 | sundayEodPoint 4/5 |
| yearStart | instantToSunday 3/3 | instantToSunday 3/5 · nowToSunday 2/5 | other 3/3 | sundayEodPoint 5/5 |

## "early next week"

| position | anthropic/claude-opus-4-8 | anthropic/claude-haiku-4-5 | openai/gpt-5.5 | openai/gpt-5.4-mini |
|---|---|---|---|---|
| weekMonday | — | nextMonWed 5/5 | — | nextMonWed 5/5 |
| weekWednesday | nextMonTue 3/3 | nextMonWed 4/5 | nextMonWed 3/3 | nextMonWed 5/5 |
| weekSunday | — | nextMonWed 5/5 | — | nextMonWed 5/5 |
| monthFirst | nextMonTue 3/3 | nextMonWed 5/5 | nextMonWed 2/3 · nextMonTue 1/3 | nextMonWed 4/5 |
| monthLast | — | nextMonWed 5/5 | — | nextMonWed 5/5 |
| quarterEnd | — | nextMonWed 5/5 | — | nextMonWed 5/5 |
| yearStart | — | nextMonWed 5/5 | — | nextMonWed 5/5 |
