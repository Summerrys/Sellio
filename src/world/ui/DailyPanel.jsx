import React from 'react';
import { Check, Trophy, Moon } from 'lucide-react';
import { Sheet, CloseButton, Coin, Bar } from './Sheet';

function ladder(streak) {
  const { current, claimed_today: claimed } = streak;
  const done = claimed ? ((Math.max(current, 1) - 1) % 7) + 1 : current % 7;
  return { done, today: claimed ? -1 : done };
}

// Today's rewards: the daily streak, three missions and the badges.
export function DailyPanel({ open, profile, busy, onClose, onClaimDaily, onClaimMission }) {
  if (!profile) return <Sheet open={open} labelId="pw-daily-title"><div className="pw-head"><h2 id="pw-daily-title">Today</h2><CloseButton onClick={onClose} /></div></Sheet>;
  const { streak, missions, achievements } = profile;
  const { done, today } = ladder(streak);
  const unclaimed = missions.filter((m) => !m.claimed).length;
  return (
    <Sheet open={open} labelId="pw-daily-title" className="tall">
      <div className="pw-head">
        <div className="pw-min0">
          <h2 id="pw-daily-title">Today on Pop-up Street</h2>
          <p className="pw-sub">New coins, missions and a daily reward every day (Singapore time).</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="pw-scroll">
        <div className="pw-explorer">
          <span className="pw-big" aria-hidden="true">{profile.level}</span>
          <div className="pw-min0" style={{ flex: 1 }}>
            <strong>Explorer level {profile.level}</strong>
            <small>{profile.next_level_at != null ? `${profile.lifetime} of ${profile.next_level_at} coins earned for level ${profile.level + 1}` : `${profile.lifetime} coins earned`}</small>
            {profile.next_level_at != null && <Bar value={profile.lifetime} max={profile.next_level_at} label="Progress to the next explorer level" />}
          </div>
        </div>

        <h3 className="pw-label">Daily reward{streak.current > 0 ? ` · ${streak.current}-day streak` : ''}</h3>
        <div className="pw-ladder">
          {streak.rewards.slice(0, 7).map((r, i) => (
            <div key={i} className={`pw-day${i < done ? ' done' : ''}${i === today ? ' today' : ''}`}>
              <span>Day {i + 1}</span>
              {i < done ? <Check size={15} strokeWidth={3} aria-label="collected" /> : <b>{r}</b>}
            </div>
          ))}
        </div>
        <div className="pw-actions">
          {streak.claimed_today
            ? <button type="button" className="pw-ghost" disabled>Collected today · back tomorrow for +{streak.reward}</button>
            : <button type="button" className="pw-primary" disabled={busy} onClick={onClaimDaily}><Coin small />Collect +{streak.reward}</button>}
        </div>

        <h3 className="pw-label">Missions</h3>
        <ul className="pw-missions">
          {missions.map((m) => {
            const ready = !m.claimed && m.progress >= m.target;
            return (
              <li key={m.code} className={`pw-mission${m.claimed ? ' claimed' : ''}`}>
                <div className="pw-min0">
                  <strong>{m.title}</strong>
                  <small><Coin small />+{m.reward} · {Math.min(m.progress, m.target)} of {m.target}</small>
                  <Bar value={m.progress} max={m.target} label={m.title} />
                </div>
                {m.claimed
                  ? <span className="pw-check" aria-label="Collected"><Check size={18} strokeWidth={3} /></span>
                  : <button type="button" className="pw-primary sm" disabled={!ready || busy} onClick={() => onClaimMission(m)}>{ready ? 'Collect' : `+${m.reward}`}</button>}
              </li>
            );
          })}
        </ul>
        <p className="pw-bonus"><Coin small />{profile.missions_all_claimed ? `All done today. Bonus +${profile.missions_bonus} collected.` : `Finish ${unclaimed === missions.length ? 'all' : `the other ${unclaimed}`} for a +${profile.missions_bonus} bonus.`}</p>
        {profile.night && (
          <p className="pw-bonus"><Moon size={16} aria-hidden="true" />{profile.night.active ? 'Night market is on: bonus coins worth more are on the street.' : `Night market ${profile.night.start}–${profile.night.end}: bonus coins worth more.`}</p>
        )}

        <h3 className="pw-label">Badges</h3>
        <div className="pw-badges">
          {achievements.map((a) => (
            <div key={a.code} className={`pw-ach${a.unlocked ? ' on' : ''}`} title={`${a.description} (+${a.reward})`}>
              <span className="pw-medal" aria-hidden="true"><Trophy size={18} /></span>
              {a.name}
              <span className="pw-sr">{a.unlocked ? 'unlocked' : 'locked'}: {a.description}, {a.reward} coins</span>
            </div>
          ))}
        </div>
        <div style={{ height: 8 }} />
      </div>
    </Sheet>
  );
}
