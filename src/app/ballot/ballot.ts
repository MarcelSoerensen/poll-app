import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { type AnswerRow, type QuestionRow, SupabaseService } from '../shared/data-access/supabase.service';
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
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);
  private readonly sessionStorageKey = 'poll-app-session-id';

  readonly survey = signal<SurveyData>(createEmptySurvey());
  readonly surveyId = signal<number | null>(null);

  readonly results = signal<QuestionResult[]>([]);
  readonly answerIdsByQuestion = signal<Map<number, number[]>>(new Map());

  readonly selectedAnswers = signal<Map<number, Set<number>>>(new Map());
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly isSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly hasSubmittedVote = signal(false);
  readonly isSubmitOverlayVisible = signal(false);

  readonly formattedEndDate = computed(() => {
    const endDate = this.survey().endDate;
    if (!endDate) return null;
    const [year, month, day] = endDate.split('-');
    return `${day}.${month}.${year}`;
  });

  constructor() {
    void this.loadSurvey();
  }

  getAnswerLabel(index: number): string {
    return String.fromCharCode(65 + index) + '.';
  }

  getAnswerPercentage(questionId: number, answerIndex: number): number {
    return this.results().find((r) => r.questionId === questionId)?.answerPercentages[answerIndex] ?? 0;
  }

  isAnswerSelected(questionId: number, answerIndex: number): boolean {
    return this.selectedAnswers().get(questionId)?.has(answerIndex) ?? false;
  }

  toggleAnswer(question: SurveyQuestion, answerIndex: number): void {
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

    const surveyId = this.surveyId();

    if (!surveyId) {
      this.submitError.set('Survey konnte nicht geladen werden.');
      this.isSubmitOverlayVisible.set(false);
      return;
    }

    if (this.hasSubmittedVote()) {
      return;
    }

    const survey = this.survey();
    const selectedAnswers = this.selectedAnswers();

    for (const question of survey.questions) {
      if ((selectedAnswers.get(question.id)?.size ?? 0) === 0) {
        this.submitError.set('Please answer every question before submitting.');
        this.isSubmitOverlayVisible.set(false);
        return;
      }
    }

    const answerIdsByQuestion = this.answerIdsByQuestion();
    const payload: Array<{ questionId: number; answerId: number }> = [];

    for (const question of survey.questions) {
      const selectedIndexes = selectedAnswers.get(question.id);
      const answerIds = answerIdsByQuestion.get(question.id) ?? [];

      if (!selectedIndexes) {
        continue;
      }

      selectedIndexes.forEach((answerIndex) => {
        const answerId = answerIds[answerIndex];

        if (answerId) {
          payload.push({ questionId: question.id, answerId });
        }
      });
    }

    if (payload.length === 0) {
      this.submitError.set('No valid answers selected.');
      this.isSubmitOverlayVisible.set(false);
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.isSubmitOverlayVisible.set(false);

    try {
      const sessionId = this.getOrCreateSessionId();
      const submissionId = await this.supabaseService.createSubmission(surveyId, sessionId);
      await this.supabaseService.createSubmissionAnswers(submissionId, payload);
      await this.refreshResults(surveyId, this.survey().questions);

      this.hasSubmittedVote.set(true);
      this.isSubmitOverlayVisible.set(true);
      this.selectedAnswers.set(new Map());
    } catch (error: unknown) {
      this.submitError.set(error instanceof Error ? error.message : 'Unbekannter Fehler beim Abstimmen.');
      this.isSubmitOverlayVisible.set(false);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async closeSubmitOverlay(): Promise<void> {
    this.isSubmitOverlayVisible.set(false);
    await this.router.navigate(['/main-page']);
  }

  private async loadSurvey(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    const ballotId = Number(this.route.snapshot.paramMap.get('id') ?? '1');

    try {
      const survey = await this.supabaseService.loadSurveyById(ballotId);

      if (!survey) {
        this.loadError.set('Survey wurde nicht gefunden.');
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
      await this.refreshResults(survey.id, this.survey().questions);
    } catch (error: unknown) {
      this.loadError.set(error instanceof Error ? error.message : 'Unbekannter Fehler beim Laden des Surveys.');
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

  private async refreshResults(surveyId: number, questions: SurveyQuestion[]): Promise<void> {
    const votes = await this.supabaseService.loadSubmissionAnswersForSurvey(surveyId);
    const answerIdsByQuestion = this.answerIdsByQuestion();

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

    this.results.set(questionResults);
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
}
