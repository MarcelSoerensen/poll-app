import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { SupabaseService } from '../shared/data-access/supabase.service';
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
  private readonly supabaseService = inject(SupabaseService);

  readonly survey = signal<SurveyData>(createEmptySurvey());

  readonly results = signal<QuestionResult[]>([]);

  readonly selectedAnswers = signal<Map<number, Set<number>>>(new Map());
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);

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

      const questions = await this.supabaseService.loadQuestionsBySurveyId(ballotId);
      const questionIds = questions.map((question) => question.id);
      const answers = await this.supabaseService.loadAnswersByQuestionIds(questionIds);

      const answersByQuestionId = new Map<number, string[]>();
      for (const answer of answers) {
        const existing = answersByQuestionId.get(answer.question_id) ?? [];
        existing.push(answer.answer_text);
        answersByQuestionId.set(answer.question_id, existing);
      }

      this.survey.set({
        title: survey.title,
        description: survey.description,
        endDate: survey.end_date ?? '',
        category: survey.category,
        questions: questions.map((question) => ({
          id: question.id,
          prompt: question.question_text,
          allowMultipleAnswers: question.allow_multiple_answers,
          answers: answersByQuestionId.get(question.id) ?? [],
        })),
      });
    } catch (error: unknown) {
      this.loadError.set(error instanceof Error ? error.message : 'Unbekannter Fehler beim Laden des Surveys.');
      this.survey.set(createEmptySurvey());
    } finally {
      this.isLoading.set(false);
    }
  }
}
