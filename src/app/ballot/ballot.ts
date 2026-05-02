import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { type RealtimeChannel } from '@supabase/supabase-js';

import { type AnswerRow, type SubmissionAnswerRow, SupabaseService } from '../shared/data-access/supabase.service';
import { type SurveyQuestion } from '../create-survey/question-item/question-item.model';

interface SurveyData {
  title: string;
  description: string;
  endDate: string;
  category: string | null;
  questions: SurveyQuestion[];
}

interface QuestionResult {
  questionId: number;
  answerPercentages: number[];
}

function createEmptySurvey(): SurveyData {
  return {
    title: '',
    description: '',
    endDate: '',
    category: null,
    questions: [],
  };
}

@Component({
  selector: 'app-ballot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './ballot.html',
  styleUrl: './ballot.scss',
})
export class Ballot {
  readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);
  private readonly sessionStorageKey = 'poll-app-session-id';
  private readonly votedSurveyIdsStorageKey = 'poll-app-voted-survey-ids';
  private readonly overlayAutoActionDelayMs = 4000;
  private voteChangesChannel: RealtimeChannel | null = null;
  private realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private validationOverlayTimer: ReturnType<typeof setTimeout> | null = null;
  private alreadyVotedOverlayTimer: ReturnType<typeof setTimeout> | null = null;

  readonly survey = signal<SurveyData>(createEmptySurvey());
  readonly surveyId = signal<number | null>(null);

  readonly persistedVotes = signal<SubmissionAnswerRow[]>([]);
  readonly answerIdsByQuestion = signal<Map<number, number[]>>(new Map());

  readonly selectedAnswers = signal<Map<number, Set<number>>>(new Map());
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly isSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly isValidationOverlayVisible = signal(false);
  readonly validationOverlayMessage = signal('Please answer every question before submitting.');
  readonly hasAlreadyVoted = signal(false);
  readonly isAlreadyVotedOverlayVisible = signal(false);
  readonly alreadyVotedMessage = signal('You have already voted.');

  readonly formattedEndDate = computed(() => {
    const endDate = this.survey().endDate;
    if (!endDate) return null;
    const [year, month, day] = endDate.split('-');
    return `${day}.${month}.${year}`;
  });

  readonly previewResults = computed(() => {
    const surveyQuestions = this.survey().questions;
    const answerIdsByQuestion = this.answerIdsByQuestion();
    const baseVotes = this.persistedVotes();

    const previewVotes = [...baseVotes];
    const selectedAnswers = this.selectedAnswers();

    for (const question of surveyQuestions) {
      const selectedIndexes = selectedAnswers.get(question.id);
      const answerIds = answerIdsByQuestion.get(question.id) ?? [];

      if (!selectedIndexes) {
        continue;
      }

      selectedIndexes.forEach((answerIndex) => {
        const answerId = answerIds[answerIndex];

        if (answerId) {
          previewVotes.push({
            question_id: question.id,
            answer_id: answerId,
          });
        }
      });
    }

    return this.calculateQuestionResults(surveyQuestions, answerIdsByQuestion, previewVotes);
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.clearRealtimeRefreshTimer();
      this.clearValidationOverlayTimer();
      this.clearAlreadyVotedOverlayTimer();
      this.supabaseService.unsubscribeChannel(this.voteChangesChannel);
      this.voteChangesChannel = null;
    });

    void this.loadSurvey();
  }

  getAnswerLabel(index: number): string {
    return String.fromCharCode(65 + index) + '.';
  }

  getAnswerPercentage(questionId: number, answerIndex: number): number {
    return this.previewResults().find((result) => result.questionId === questionId)?.answerPercentages[answerIndex] ?? 0;
  }

  isAnswerSelected(questionId: number, answerIndex: number): boolean {
    return this.selectedAnswers().get(questionId)?.has(answerIndex) ?? false;
  }

  toggleAnswer(question: SurveyQuestion, answerIndex: number): void {
    if (this.hasAlreadyVoted()) {
      this.showAlreadyVotedOverlay();
      return;
    }

    this.closeValidationOverlay();

    this.selectedAnswers.update((map) => {
      const next = new Map(map);
      const selected = new Set(next.get(question.id) ?? []);

      if (!question.allowMultipleAnswers) {
        const alreadySelected = selected.has(answerIndex);
        selected.clear();
        if (!alreadySelected) {
          selected.add(answerIndex);
        }
      } else {
        if (selected.has(answerIndex)) {
          selected.delete(answerIndex);
        } else {
          selected.add(answerIndex);
        }
      }

      next.set(question.id, selected);
      return next;
    });
  }

  async submitVote(event: Event): Promise<void> {
    event.preventDefault();

    if (this.isSubmitting()) {
      return;
    }

    if (this.hasAlreadyVoted()) {
      this.showAlreadyVotedOverlay();
      return;
    }

    const surveyId = this.surveyId();

    if (!surveyId) {
      this.submitError.set('Survey could not be loaded.');
      return;
    }

    const survey = this.survey();
    const selectedAnswers = this.selectedAnswers();
    const answerIdsByQuestion = this.answerIdsByQuestion();
    const payload = this.buildSubmissionPayload(survey.questions, selectedAnswers, answerIdsByQuestion);

    if (payload === null) {
      this.submitError.set(null);
      this.validationOverlayMessage.set('Please answer every question before submitting.');
      this.showValidationOverlay();
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.closeValidationOverlay();

    try {
      const sessionId = this.getOrCreateSessionId();
      const submissionId = await this.supabaseService.createSubmission(surveyId, sessionId);
      await this.supabaseService.createSubmissionAnswers(submissionId, payload);
      await this.refreshResults(surveyId);
      this.markSurveyAsVoted(surveyId);
      this.hasAlreadyVoted.set(true);

      this.selectedAnswers.set(new Map());
      await this.router.navigate(['/main-page']);
    } catch (error: unknown) {
      this.submitError.set(error instanceof Error ? error.message : 'Unknown error while submitting the vote.');
      this.closeValidationOverlay();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  closeValidationOverlay(): void {
    this.clearValidationOverlayTimer();
    this.isValidationOverlayVisible.set(false);
  }

  async closeAlreadyVotedOverlay(): Promise<void> {
    this.clearAlreadyVotedOverlayTimer();
    this.isAlreadyVotedOverlayVisible.set(false);
    await this.router.navigate(['/main-page']);
  }

  private async loadSurvey(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    const ballotId = Number(this.route.snapshot.paramMap.get('id') ?? '1');

    try {
      const survey = await this.supabaseService.loadSurveyById(ballotId);

      if (!survey) {
        this.loadError.set('Survey was not found.');
        this.survey.set(createEmptySurvey());
        return;
      }

      this.surveyId.set(survey.id);

      const questions = await this.supabaseService.loadQuestionsBySurveyId(ballotId);
      const questionIds = questions.map((question) => question.id);
      const answers = await this.supabaseService.loadAnswersByQuestionIds(questionIds);

      const answersByQuestionId = this.groupAnswersByQuestion(answers);
      const answerIdsByQuestion = this.mapAnswerIdsByQuestion(answersByQuestionId);

      this.survey.set({
        title: survey.title,
        description: survey.description,
        endDate: survey.end_date ?? '',
        category: survey.category,
        questions: questions.map((question) => ({
          id: question.id,
          prompt: question.question_text,
          allowMultipleAnswers: question.allow_multiple_answers,
          answers: (answersByQuestionId.get(question.id) ?? []).map((answer) => answer.answer_text),
        })),
      });
      this.answerIdsByQuestion.set(answerIdsByQuestion);
      await this.refreshResults(survey.id);
      await this.syncAlreadyVotedState(survey.id);
      this.startVoteResultsRealtimeSync(survey.id);
    } catch (error: unknown) {
      this.loadError.set(error instanceof Error ? error.message : 'Unknown error while loading the survey.');
      this.survey.set(createEmptySurvey());
      this.surveyId.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  private groupAnswersByQuestion(answers: AnswerRow[]): Map<number, AnswerRow[]> {
    const grouped = new Map<number, AnswerRow[]>();

    for (const answer of answers) {
      const existing = grouped.get(answer.question_id) ?? [];
      existing.push(answer);
      grouped.set(answer.question_id, existing);
    }

    for (const [questionId, groupedAnswers] of grouped) {
      grouped.set(
        questionId,
        [...groupedAnswers].sort((left, right) => left.answer_order - right.answer_order),
      );
    }

    return grouped;
  }

  private mapAnswerIdsByQuestion(answersByQuestionId: Map<number, AnswerRow[]>): Map<number, number[]> {
    const answerIdsByQuestion = new Map<number, number[]>();

    for (const [questionId, answers] of answersByQuestionId) {
      answerIdsByQuestion.set(questionId, answers.map((answer) => answer.id));
    }

    return answerIdsByQuestion;
  }

  private async refreshResults(surveyId: number): Promise<void> {
    const votes = await this.supabaseService.loadSubmissionAnswersForSurvey(surveyId);
    this.persistedVotes.set(votes);
  }

  private startVoteResultsRealtimeSync(surveyId: number): void {
    this.supabaseService.unsubscribeChannel(this.voteChangesChannel);

    this.voteChangesChannel = this.supabaseService.subscribeToSurveySubmissionChanges(surveyId, () => {
      this.scheduleRealtimeRefresh();
    });
  }

  private scheduleRealtimeRefresh(): void {
    const surveyId = this.surveyId();

    if (!surveyId) {
      return;
    }

    this.clearRealtimeRefreshTimer();
    this.realtimeRefreshTimer = setTimeout(() => {
      this.realtimeRefreshTimer = null;
      void this.refreshResults(surveyId);
    }, 150);
  }

  private clearRealtimeRefreshTimer(): void {
    if (this.realtimeRefreshTimer === null) {
      return;
    }

    clearTimeout(this.realtimeRefreshTimer);
    this.realtimeRefreshTimer = null;
  }

  private buildSubmissionPayload(
    questions: SurveyQuestion[],
    selectedAnswers: Map<number, Set<number>>,
    answerIdsByQuestion: Map<number, number[]>,
  ): Array<{ questionId: number; answerId: number }> | null {
    const payload: Array<{ questionId: number; answerId: number }> = [];

    for (const question of questions) {
      const selectedIndexes = selectedAnswers.get(question.id);
      const answerIds = answerIdsByQuestion.get(question.id) ?? [];

      if (!selectedIndexes || selectedIndexes.size === 0) {
        return null;
      }

      selectedIndexes.forEach((answerIndex) => {
        const answerId = answerIds[answerIndex];

        if (answerId) {
          payload.push({ questionId: question.id, answerId });
        }
      });
    }

    return payload;
  }

  private calculateQuestionResults(
    questions: SurveyQuestion[],
    answerIdsByQuestion: Map<number, number[]>,
    votes: SubmissionAnswerRow[],
  ): QuestionResult[] {
    const questionResults: QuestionResult[] = questions.map((question) => {
      const answerIds = answerIdsByQuestion.get(question.id) ?? [];
      const counts = new Array<number>(answerIds.length).fill(0);

      for (const vote of votes) {
        if (vote.question_id !== question.id) {
          continue;
        }

        const answerIndex = answerIds.indexOf(vote.answer_id);
        if (answerIndex >= 0) {
          counts[answerIndex] += 1;
        }
      }

      const totalVotesForQuestion = counts.reduce((sum, count) => sum + count, 0);
      const answerPercentages = totalVotesForQuestion === 0
        ? counts.map(() => 0)
        : counts.map((count) => Math.round((count / totalVotesForQuestion) * 100));

      return {
        questionId: question.id,
        answerPercentages,
      };
    });

    return questionResults;
  }

  private getOrCreateSessionId(): string {
    const randomId = () => {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
      }

      return `session-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    };

    try {
      const existing = localStorage.getItem(this.sessionStorageKey);
      if (existing) {
        return existing;
      }

      const created = randomId();
      localStorage.setItem(this.sessionStorageKey, created);
      return created;
    } catch {
      return randomId();
    }
  }

  private async syncAlreadyVotedState(surveyId: number): Promise<void> {
    if (this.isSurveyMarkedAsVoted(surveyId)) {
      this.hasAlreadyVoted.set(true);
      this.showAlreadyVotedOverlay();
      return;
    }

    try {
      const sessionId = this.getOrCreateSessionId();
      const hasSubmittedSurvey = await this.supabaseService.hasSessionSubmittedSurvey(surveyId, sessionId);

      if (!hasSubmittedSurvey) {
        this.hasAlreadyVoted.set(false);
        return;
      }

      this.markSurveyAsVoted(surveyId);
      this.hasAlreadyVoted.set(true);
      this.showAlreadyVotedOverlay();
    } catch {
      this.hasAlreadyVoted.set(false);
    }
  }

  private showValidationOverlay(): void {
    this.isValidationOverlayVisible.set(true);
    this.clearValidationOverlayTimer();
    this.validationOverlayTimer = setTimeout(() => {
      this.validationOverlayTimer = null;
      this.closeValidationOverlay();
    }, this.overlayAutoActionDelayMs);
  }

  private showAlreadyVotedOverlay(): void {
    this.isAlreadyVotedOverlayVisible.set(true);
    this.clearAlreadyVotedOverlayTimer();
    this.alreadyVotedOverlayTimer = setTimeout(() => {
      this.alreadyVotedOverlayTimer = null;
      void this.closeAlreadyVotedOverlay();
    }, this.overlayAutoActionDelayMs);
  }

  private clearValidationOverlayTimer(): void {
    if (this.validationOverlayTimer === null) {
      return;
    }

    clearTimeout(this.validationOverlayTimer);
    this.validationOverlayTimer = null;
  }

  private clearAlreadyVotedOverlayTimer(): void {
    if (this.alreadyVotedOverlayTimer === null) {
      return;
    }

    clearTimeout(this.alreadyVotedOverlayTimer);
    this.alreadyVotedOverlayTimer = null;
  }

  private isSurveyMarkedAsVoted(surveyId: number): boolean {
    const votedSurveyIds = this.getStoredVotedSurveyIds();
    return votedSurveyIds.includes(surveyId);
  }

  private markSurveyAsVoted(surveyId: number): void {
    const votedSurveyIds = this.getStoredVotedSurveyIds();

    if (votedSurveyIds.includes(surveyId)) {
      return;
    }

    votedSurveyIds.push(surveyId);

    try {
      localStorage.setItem(this.votedSurveyIdsStorageKey, JSON.stringify(votedSurveyIds));
    } catch {
      // Ignore storage errors (e.g. private mode restrictions).
    }
  }

  private getStoredVotedSurveyIds(): number[] {
    try {
      const rawValue = localStorage.getItem(this.votedSurveyIdsStorageKey);

      if (!rawValue) {
        return [];
      }

      const parsed = JSON.parse(rawValue) as unknown;

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((item): item is number => Number.isInteger(item));
    } catch {
      return [];
    }
  }
}
