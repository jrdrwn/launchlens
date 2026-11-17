// The farm plans: one protocol's record in, concrete steps out.
//
// A plan is derived from the protocol's own record — its category, its
// chains, its TVL and its age — never from a hand-written list of names.
// Every step carries what it costs and how long it takes, in the step
// itself, so a reader can judge the plan without opening anything else.
//
//   capital: how much one farm position needs, from the protocol's TVL
//   gas:     a rough cost per transaction on the protocol's first chain
//   hold:    how long to keep the position, from the protocol's age —
//            younger protocols get a longer qualifying window, so the
//            activity is counted in more than one snapshot
//   action:  the category's own move (supply, provide liquidity, stake,
//            mint, vote, hedge), and a second, different move the same
//            week, so the wallet's activity is a pattern, not one deposit

import type { SnapshotProtocol } from './snapshot.ts';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** A rough cost of one transaction on a chain, in dollars, as the plan states it. */
function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'about $8';
  if (c === 'arbitrum') return 'about $1.50';
  if (c === 'base') return 'about $0.50';
  if (c === 'optimism') return 'about $1';
  if (c === 'solana') return 'about $0.10';
  if (c === 'polygon') return 'about $0.30';
  if (c === 'avalanche') return 'about $0.80';
  if (c === 'bsc' || c === 'binance') return 'about $0.50';
  if (c === 'bitcoin') return 'about $2';
  return 'about $2';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function mainAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} as a lender and keep the position open.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('farm')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} and place one market position on ${name}, then leave the funds in the account.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (c.includes('yield')) {
    return `Deposit $${capital} of USDC into ${name}'s main yield strategy on ${chain} and keep it staked.`;
  }
  if (c.includes('card') || c.includes('payment')) {
    return `Top up $${capital} through ${name} on ${chain} and spend at least once from the balance.`;
  }
  if (c.includes('governance')) {
    return `Lock $${capital} of voting power through ${name} on ${chain} and cast one vote.`;
  }
  if (c.includes('index')) {
    return `Buy $${capital} of the ${name} index on ${chain} and hold the shares.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second, different action, so the wallet shows a pattern, not one deposit. */
function secondAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Borrow a small amount against the supply on ${name} and repay it the same week.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('farm')) {
    return `Swap a small amount in ${name}'s pool on ${chain} and add the proceeds back as liquidity.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge a second, smaller amount back through ${name} so the wallet has traffic both ways.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Claim the staking rewards ${name} pays and restake them instead of withdrawing.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) {
    return `Close the hedge on ${name} and open a fresh one at a different size.`;
  }
  if (c.includes('prediction')) {
    return `Place a second position on a different market on ${name}.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) {
    return `Deposit a second tranche into another ${name} vault on ${chain}.`;
  }
  if (c.includes('stable')) {
    return `Swap a small amount of the stable asset on ${name} and hold the result.`;
  }
  if (c.includes('rwa')) {
    return `Check the yield the ${name} asset has paid and reinvest one payout.`;
  }
  if (c.includes('insurance')) {
    return `Open a second, smaller cover on ${name} for a different risk.`;
  }
  if (c.includes('yield')) {
    return `Move the ${name} position into a second strategy on ${chain} for one week.`;
  }
  if (c.includes('card') || c.includes('payment')) {
    return `Make a second purchase with the ${name} balance on ${chain}.`;
  }
  if (c.includes('governance')) {
    return `Vote on a second proposal through ${name} on ${chain}.`;
  }
  if (c.includes('index')) {
    return `Rebalance the ${name} index holding once, adding a small amount.`;
  }
  return `Use ${name} a second way on ${chain}, such as a swap, a vote or a second deposit.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time. The plan is derived from the protocol's own record (category,
 * chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = gasFor(chain);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: mainAction(p, capital, chain),
      cost: `$${capital} of capital and ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondAction(p, capital, chain),
      cost: `${gas} of gas and no new capital`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week on ${p.name}, such as a deposit, a borrow, a swap or a vote.`,
      cost: `${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** A protocol's farm plan as the board's strings. */
export function farmStepStrings(p: SnapshotProtocol, age: number | null): string[] {
  return farmSteps(p, age).map(stepText);
}
