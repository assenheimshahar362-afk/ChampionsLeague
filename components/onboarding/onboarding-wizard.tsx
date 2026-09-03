"use client";

import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Trophy,
  UserRound,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useActionState,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { formSurfaceStyles } from "@/components/ui/form-surface";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  completeOnboarding,
  type OnboardingState,
} from "@/lib/onboarding/actions";
import type {
  PlayerPickCandidate,
  TeamPickCandidate,
} from "@/lib/season-picks/types";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

const initialState: OnboardingState = { status: "idle" };
const nicknamePattern = /^[\p{L}\p{N} _.\-]+$/u;

export function OnboardingWizard({
  season,
  teams,
  players,
  initialNickname = "",
  initialChampionCandidateId,
  initialTopScorerCandidateId,
  initialStep = 1,
  next,
}: {
  season: number;
  teams: TeamPickCandidate[];
  players: PlayerPickCandidate[];
  initialNickname?: string;
  initialChampionCandidateId?: number;
  initialTopScorerCandidateId?: number;
  initialStep?: Step;
  next: string;
}) {
  const t = useTranslations("onboarding.wizard");
  const errors = useTranslations("onboarding.errors");
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    completeOnboarding,
    initialState
  );
  const [step, setStep] = useState<Step>(initialStep);
  const [nickname, setNickname] = useState(initialNickname);
  const [nicknameTouched, setNicknameTouched] = useState(false);
  const [teamId, setTeamId] = useState(
    initialChampionCandidateId ? String(initialChampionCandidateId) : ""
  );
  const [playerId, setPlayerId] = useState(
    initialTopScorerCandidateId ? String(initialTopScorerCandidateId) : ""
  );
  const [revision, setRevision] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const trimmedNickname = nickname.trim();
  const nicknameValid =
    trimmedNickname.length >= 2 &&
    trimmedNickname.length <= 30 &&
    nicknamePattern.test(trimmedNickname) &&
    /\p{L}/u.test(trimmedNickname);
  const selectedTeam = teams.find(
    (candidate) => String(candidate.candidateId) === teamId
  );
  const selectedPlayer = players.find(
    (candidate) => String(candidate.candidateId) === playerId
  );
  const complete = Boolean(
    nicknameValid && selectedTeam && selectedPlayer
  );
  const activeError =
    state.status === "error" && state.revision === revision ? state : null;

  const maxReachable: Step = !nicknameValid
    ? 1
    : !selectedTeam
      ? 2
      : !selectedPlayer
        ? 3
        : 4;

  const stepLabels = [
    t("steps.nickname"),
    t("steps.champion"),
    t("steps.scorer"),
    t("steps.review"),
  ];

  function markChanged() {
    setRevision((current) => current + 1);
  }

  function moveTo(nextStep: Step) {
    if (nextStep > maxReachable) return;
    setStep(nextStep);
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function continueForward() {
    if (step === 1) {
      setNicknameTouched(true);
      if (nicknameValid) moveTo(2);
      return;
    }
    if (step === 2 && selectedTeam) moveTo(3);
    if (step === 3 && selectedPlayer) moveTo(4);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (step < 4) {
      event.preventDefault();
      continueForward();
      return;
    }
    if (!complete) {
      event.preventDefault();
      moveTo(maxReachable);
    }
  }

  function selectTeam(value: string) {
    setTeamId(value);
    markChanged();
  }

  function selectPlayer(value: string) {
    setPlayerId(value);
    markChanged();
  }

  const seasonLabel = `${season}/${String(season + 1).slice(-2)}`;

  return (
    <form
      action={action}
      onSubmit={handleSubmit}
      className={formSurfaceStyles(
        "relative isolate w-full overflow-hidden p-4 sm:p-6 lg:p-7"
      )}
    >
      <input type="hidden" name="nickname" value={trimmedNickname} />
      <input type="hidden" name="season" value={season} />
      <input type="hidden" name="championCandidateId" value={teamId} />
      <input type="hidden" name="topScorerCandidateId" value={playerId} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="revision" value={revision} />

      <header className="mx-auto max-w-xl text-center">
        <div className="text-floodlight flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t("eyebrow", { season: seasonLabel })}
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          {t("heading")}
        </h1>
        <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-sm text-pretty">
          {t("intro")}
        </p>
      </header>

      <StepProgress
        current={step}
        maxReachable={maxReachable}
        labels={stepLabels}
        onSelect={moveTo}
      />

      <div className="mx-auto mt-7 max-w-2xl border-t border-white/10 pt-6 sm:mt-8 sm:pt-7">
        {step === 1 ? (
          <NicknameStep
            ref={headingRef}
            value={nickname}
            valid={nicknameValid}
            touched={nicknameTouched}
            serverError={activeError?.field === "nickname"}
            onBlur={() => setNicknameTouched(true)}
            onChange={(value) => {
              setNickname(value);
              markChanged();
            }}
          />
        ) : null}

        {step === 2 ? (
          <ChampionStep
            ref={headingRef}
            teams={teams}
            value={teamId}
            onChange={selectTeam}
          />
        ) : null}

        {step === 3 ? (
          <ScorerStep
            ref={headingRef}
            players={players}
            value={playerId}
            onChange={selectPlayer}
          />
        ) : null}

        {step === 4 && selectedTeam && selectedPlayer ? (
          <ReviewStep
            ref={headingRef}
            nickname={trimmedNickname}
            team={selectedTeam}
            player={selectedPlayer}
            onEdit={moveTo}
          />
        ) : null}

        {activeError ? (
          <div
            role="alert"
            className="border-destructive/35 bg-destructive/10 text-destructive mt-5 rounded-xl border px-4 py-3 text-sm"
          >
            <p>{errors(activeError.code)}</p>
            {activeError.field !== "form" ? (
              <button
                type="button"
                className="mt-2 font-semibold underline underline-offset-4"
                onClick={() =>
                  moveTo(
                    activeError.field === "nickname"
                      ? 1
                      : activeError.field === "champion"
                        ? 2
                        : 3
                  )
                }
              >
                {t("fixSelection")}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-7 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
          {step > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => moveTo((step - 1) as Step)}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
              {t("back")}
            </Button>
          ) : (
            <span />
          )}

          {step < 4 ? (
            <Button
              type="button"
              size="lg"
              disabled={step > maxReachable || step === maxReachable}
              onClick={continueForward}
              className="min-w-32"
            >
              {t("continue")}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              disabled={!complete || pending}
              className="min-w-40"
            >
              {pending ? (
                <>
                  <Loader2
                    className="size-4 animate-spin [animation-duration:600ms]"
                    aria-hidden="true"
                  />
                  {t("saving")}
                </>
              ) : (
                <>
                  {t("finish")}
                  <Check className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function StepProgress({
  current,
  maxReachable,
  labels,
  onSelect,
}: {
  current: Step;
  maxReachable: Step;
  labels: string[];
  onSelect: (step: Step) => void;
}) {
  const t = useTranslations("onboarding.wizard");

  return (
    <nav className="mx-auto mt-7 max-w-2xl" aria-label={t("progressLabel")}>
      <ol className="grid grid-cols-4">
        {labels.map((label, index) => {
          const itemStep = (index + 1) as Step;
          const done = itemStep < current && itemStep <= maxReachable;
          const active = itemStep === current;
          const enabled = itemStep <= maxReachable;

          return (
            <li key={label} className="relative text-center">
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-4 end-1/2 h-px w-full",
                    itemStep <= maxReachable ? "bg-primary/60" : "bg-white/12"
                  )}
                />
              ) : null}
              <button
                type="button"
                disabled={!enabled}
                aria-current={active ? "step" : undefined}
                aria-label={t("stepLabel", {
                  current: itemStep,
                  total: labels.length,
                  label,
                })}
                onClick={() => onSelect(itemStep)}
                className="group relative z-10 mx-auto flex min-w-0 flex-col items-center gap-2 disabled:cursor-not-allowed"
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border text-xs font-bold transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-snap group-active:scale-[0.96]",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_rgb(96_183_255/0.12)]"
                      : done
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-white/15 bg-surface/80 text-muted-foreground"
                  )}
                >
                  {done ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    itemStep
                  )}
                </span>
                <span
                  className={cn(
                    "hidden max-w-28 truncate text-xs font-medium sm:block",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function NicknameStep({
  ref,
  value,
  valid,
  touched,
  serverError,
  onChange,
  onBlur,
}: {
  ref: React.Ref<HTMLHeadingElement>;
  value: string;
  valid: boolean;
  touched: boolean;
  serverError: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const t = useTranslations("onboarding.wizard");
  const invalid = (touched && !valid) || serverError;

  return (
    <section aria-labelledby="onboarding-step-title">
      <StepHeading
        ref={ref}
        icon={UserRound}
        title={t("nicknameTitle")}
        description={t("nicknameDescription")}
      />
      <div className="mx-auto mt-6 max-w-lg">
        <Label htmlFor="onboarding-nickname">{t("nicknameLabel")}</Label>
        <div className="relative mt-2">
          <UserRound
            className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            id="onboarding-nickname"
            type="text"
            autoComplete="nickname"
            autoFocus
            value={value}
            minLength={2}
            maxLength={30}
            aria-invalid={invalid || undefined}
            aria-describedby="onboarding-nickname-hint"
            onBlur={onBlur}
            onChange={(event) => onChange(event.target.value)}
            className="h-12 ps-10 pe-14 text-base"
          />
          <span
            data-numeric
            className="text-muted-foreground pointer-events-none absolute top-1/2 end-3 -translate-y-1/2 text-xs"
          >
            {value.length}/30
          </span>
        </div>
        <p
          id="onboarding-nickname-hint"
          className={cn(
            "mt-2 text-xs",
            invalid ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {invalid ? t("nicknameInvalid") : t("nicknameHint")}
        </p>
      </div>
    </section>
  );
}

function ChampionStep({
  ref,
  teams,
  value,
  onChange,
}: {
  ref: React.Ref<HTMLHeadingElement>;
  teams: TeamPickCandidate[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("onboarding.wizard");
  const locale = useLocale();

  return (
    <section aria-labelledby="onboarding-step-title">
      <StepHeading
        ref={ref}
        icon={Trophy}
        title={t("championTitle")}
        description={t("championDescription")}
      />
      <RewardNote />
      <div className="mx-auto mt-5 max-w-xl">
        <CandidateCombobox
          label={t("championLabel")}
          placeholder={t("championPlaceholder")}
          searchPlaceholder={t("searchTeams")}
          emptyLabel={t("noTeamResults")}
          items={teams}
          value={value}
          onChange={onChange}
          searchText={(team) => `${team.nameHe} ${team.nameEn}`}
          renderCandidate={(team, context) => (
            <TeamCandidateContent
              team={team}
              locale={locale}
              allowWrap={context === "option"}
            />
          )}
        />
      </div>
    </section>
  );
}

function ScorerStep({
  ref,
  players,
  value,
  onChange,
}: {
  ref: React.Ref<HTMLHeadingElement>;
  players: PlayerPickCandidate[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("onboarding.wizard");
  const locale = useLocale();

  return (
    <section aria-labelledby="onboarding-step-title">
      <StepHeading
        ref={ref}
        icon={UserRound}
        title={t("scorerTitle")}
        description={t("scorerDescription")}
      />
      <RewardNote />
      <div className="mx-auto mt-5 max-w-xl">
        <CandidateCombobox
          label={t("scorerLabel")}
          placeholder={t("scorerPlaceholder")}
          searchPlaceholder={t("searchPlayers")}
          emptyLabel={t("noPlayerResults")}
          items={players}
          value={value}
          onChange={onChange}
          searchText={(player) =>
            `${player.nameHe} ${player.nameEn} ${player.teamNameHe} ${player.teamNameEn}`
          }
          renderCandidate={(player, context) => (
            <PlayerCandidateContent
              player={player}
              locale={locale}
              allowWrap={context === "option"}
            />
          )}
        />
      </div>
    </section>
  );
}

function RewardNote() {
  const t = useTranslations("onboarding.wizard");
  return (
    <div className="border-primary/20 bg-primary/[0.07] mx-auto mt-5 flex max-w-xl gap-3 rounded-xl border p-3.5">
      <Sparkles
        className="text-floodlight mt-0.5 size-4 shrink-0"
        aria-hidden="true"
      />
      <p className="text-muted-foreground text-xs leading-relaxed">
        <strong className="text-foreground font-semibold">
          {t("rewardTitle")}
        </strong>{" "}
        {t("rewardDescription")}
      </p>
    </div>
  );
}

function ReviewStep({
  ref,
  nickname,
  team,
  player,
  onEdit,
}: {
  ref: React.Ref<HTMLHeadingElement>;
  nickname: string;
  team: TeamPickCandidate;
  player: PlayerPickCandidate;
  onEdit: (step: Step) => void;
}) {
  const t = useTranslations("onboarding.wizard");
  const locale = useLocale();

  return (
    <section aria-labelledby="onboarding-step-title">
      <StepHeading
        ref={ref}
        icon={Check}
        title={t("reviewTitle")}
        description={t("reviewDescription")}
      />
      <div className="mx-auto mt-5 flex max-w-xl flex-col gap-2">
        <ReviewCard
          label={t("nicknameLabel")}
          onEdit={() => onEdit(1)}
          editLabel={t("editNickname")}
        >
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <UserRound className="size-4.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold">
            {nickname}
          </span>
        </ReviewCard>

        <ReviewCard
          label={t("championLabel")}
          onEdit={() => onEdit(2)}
          editLabel={t("editChampion")}
        >
          <TeamCandidateContent team={team} locale={locale} />
        </ReviewCard>

        <ReviewCard
          label={t("scorerLabel")}
          onEdit={() => onEdit(3)}
          editLabel={t("editScorer")}
        >
          <PlayerCandidateContent player={player} locale={locale} />
        </ReviewCard>
      </div>
      <p className="text-muted-foreground mx-auto mt-4 max-w-lg text-center text-xs text-pretty">
        {t("finishHint")}
      </p>
    </section>
  );
}

function ReviewCard({
  label,
  editLabel,
  onEdit,
  children,
}: {
  label: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <article className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.045] p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-[0.6875rem] font-medium">
          {label}
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-2.5">{children}</div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label={editLabel}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </button>
    </article>
  );
}

function StepHeading({
  ref,
  icon: Icon,
  title,
  description,
}: {
  ref: React.Ref<HTMLHeadingElement>;
  icon: typeof Trophy;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <span className="border-primary/20 bg-primary/10 text-primary mx-auto flex size-10 items-center justify-center rounded-xl border">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2
        id="onboarding-step-title"
        ref={ref}
        tabIndex={-1}
        className="mt-3 text-xl font-bold tracking-tight outline-none sm:text-2xl"
      >
        {title}
      </h2>
      <p className="text-muted-foreground mx-auto mt-1.5 max-w-lg text-sm text-pretty">
        {description}
      </p>
    </div>
  );
}

type Candidate = { candidateId: number };
type CandidateRenderContext = "trigger" | "option";

function CandidateCombobox<T extends Candidate>({
  label,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  items,
  value,
  onChange,
  searchText,
  renderCandidate,
}: {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  items: T[];
  value: string;
  onChange: (value: string) => void;
  searchText: (item: T) => string;
  renderCandidate: (item: T, context: CandidateRenderContext) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const listId = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = items.find((item) => String(item.candidateId) === value);
  const filtered = useMemo(
    () =>
      deferredQuery
        ? items.filter((item) =>
            searchText(item).toLocaleLowerCase().includes(deferredQuery)
          )
        : items,
    [deferredQuery, items, searchText]
  );

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setQuery("");
  }

  function select(item: T) {
    onChange(String(item.candidateId));
    setOpen(false);
    setQuery("");
  }

  function focusOption(index: number) {
    if (filtered.length === 0) return;
    const bounded = (index + filtered.length) % filtered.length;
    optionRefs.current[bounded]?.focus();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(0);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(filtered.length - 1);
    }
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      focusOption(filtered.length - 1);
    }
  }

  return (
    <div>
      <Label>{label}</Label>
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Trigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-haspopup="listbox"
            className={cn(
              "focus-visible:border-ring focus-visible:ring-ring/50 mt-2 flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 text-start shadow-[inset_0_1px_0_rgb(255_255_255/0.035)] backdrop-blur-md",
              "transition-[background-color,border-color,box-shadow,transform] duration-150 ease-snap focus-visible:ring-3 focus-visible:outline-none active:scale-[0.99]",
              selected
                ? "border-primary/35 bg-primary/[0.065]"
                : "border-white/18 bg-background/45"
            )}
          >
            {selected ? (
              renderCandidate(selected, "trigger")
            ) : (
              <span className="text-muted-foreground min-w-0 flex-1 px-1 text-sm">
                {placeholder}
              </span>
            )}
            <ChevronDown
              className={cn(
                "text-muted-foreground size-4 shrink-0 transition-transform duration-150 ease-snap",
                open && "rotate-180"
              )}
              aria-hidden="true"
            />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className="bg-popover text-popover-foreground z-50 w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 p-2 shadow-[0_22px_60px_rgb(0_0_0/0.45)] outline-none [transform-origin:var(--radix-popover-content-transform-origin)]"
          >
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                type="search"
                dir="auto"
                role="searchbox"
                autoFocus
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="h-10 ps-9"
              />
            </div>
            <div
              id={listId}
              role="listbox"
              aria-label={label}
              className="mt-2 max-h-72 space-y-1 overflow-y-auto overscroll-contain pe-1"
            >
              {filtered.map((item, index) => {
                const selectedItem = String(item.candidateId) === value;
                return (
                  <button
                    key={item.candidateId}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={selectedItem}
                    onClick={() => select(item)}
                    onKeyDown={(event) => handleOptionKeyDown(event, index)}
                    className={cn(
                      "focus-visible:bg-accent flex min-h-14 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-[background-color,transform] duration-150 ease-snap focus-visible:outline-none active:scale-[0.99]",
                      selectedItem ? "bg-primary/10" : "hover:bg-white/[0.06]"
                    )}
                  >
                    {renderCandidate(item, "option")}
                    <Check
                      className={cn(
                        "text-primary size-4 shrink-0",
                        !selectedItem && "opacity-0"
                      )}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
              {filtered.length === 0 ? (
                <p className="text-muted-foreground px-3 py-8 text-center text-sm">
                  {emptyLabel}
                </p>
              ) : null}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function TeamCandidateContent({
  team,
  locale,
  allowWrap = false,
}: {
  team: TeamPickCandidate;
  locale: string;
  allowWrap?: boolean;
}) {
  const name = localizedCandidateName(locale, team.nameHe, team.nameEn);
  return (
    <>
      <CandidateImage
        imageUrl={team.logoUrl}
        fallback={<Trophy className="text-muted-foreground size-5" />}
        round={false}
        contain
      />
      <span
        dir="auto"
        title={name}
        className={cn(
          "min-w-0 flex-1 text-start text-sm font-semibold [unicode-bidi:plaintext]",
          allowWrap ? "break-words" : "truncate"
        )}
      >
        {name}
      </span>
      <PointsBadge points={team.points} />
    </>
  );
}

function PlayerCandidateContent({
  player,
  locale,
  allowWrap = false,
}: {
  player: PlayerPickCandidate;
  locale: string;
  allowWrap?: boolean;
}) {
  const name = localizedCandidateName(locale, player.nameHe, player.nameEn);
  const teamName = localizedCandidateName(
    locale,
    player.teamNameHe,
    player.teamNameEn
  );
  return (
    <>
      <CandidateImage
        imageUrl={player.photoUrl}
        fallback={<UserRound className="text-muted-foreground size-5" />}
        round
      />
      <span className="min-w-0 flex-1 overflow-hidden text-start">
        <span
          dir="auto"
          title={name}
          className={cn(
            "block text-sm font-semibold [unicode-bidi:plaintext]",
            allowWrap ? "break-words" : "truncate"
          )}
        >
          {name}
        </span>
        <span
          dir="auto"
          title={teamName}
          className={cn(
            "text-muted-foreground block text-xs [unicode-bidi:plaintext]",
            allowWrap ? "break-words" : "truncate"
          )}
        >
          {teamName}
        </span>
      </span>
      <PointsBadge points={player.points} />
    </>
  );
}

function localizedCandidateName(
  locale: string,
  hebrewName: string,
  englishName: string
): string {
  const preferredName = locale === "he" ? hebrewName : englishName;
  const fallbackName = locale === "he" ? englishName : hebrewName;
  return preferredName.trim() || fallbackName.trim();
}

function CandidateImage({
  imageUrl,
  fallback,
  round,
  contain = false,
}: {
  imageUrl: string | null;
  fallback: ReactNode;
  round: boolean;
  contain?: boolean;
}) {
  return (
    <span
      className={cn(
        "bg-muted relative flex size-10 shrink-0 items-center justify-center overflow-hidden border border-white/10",
        round ? "rounded-full" : "rounded-lg"
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="40px"
          className={contain ? "object-contain p-1" : "object-cover"}
          unoptimized
        />
      ) : (
        fallback
      )}
    </span>
  );
}

function PointsBadge({ points }: { points: number }) {
  const t = useTranslations("onboarding.wizard");
  return (
    <span
      dir="auto"
      data-numeric
      className="bg-accent text-accent-foreground shrink-0 rounded-lg px-2 py-1 text-xs font-bold"
    >
      {t("points", { points })}
    </span>
  );
}
