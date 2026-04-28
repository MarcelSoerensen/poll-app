import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { SupabaseService } from '../shared/data-access/supabase.service';
import { QuestionItem } from './question-item/question-item';
import { createSurveyQuestion, type SurveyQuestion } from './question-item/question-item.model';

interface SurveyDraft {
  title: string;
  endDate: string;
  category: string | null;
  description: string;
  questions: SurveyQuestion[];
}

interface SurveyValidationState {
  title: boolean;
  questionIds: number[];
  answerKeys: string[];
}

function createValidationState(): SurveyValidationState {
  return {
    title: false,
    questionIds: [],
    answerKeys: [],
  };
}

function createSurveyDraft(): SurveyDraft {
  return {
    title: '',
    endDate: '',
    category: null,
    description: '',
    questions: [createSurveyQuestion(1)],
  };
}

function toIsoLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTomorrowIsoDate(): string {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toIsoLocalDate(tomorrow);
}

@Component({
  selector: 'app-create-survey',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, QuestionItem],
  templateUrl: './create-survey.html',
  styleUrl: './create-survey.scss',
})
export class CreateSurvey {
  private readonly supabaseService = inject(SupabaseService);
  private readonly router = inject(Router);

  readonly categories = [
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Technology & Innovation',
  ];

  readonly isCategoryDropdownOpen = signal(false);
  readonly survey = signal<SurveyDraft>(createSurveyDraft());
  readonly selectedCategory = computed(() => this.survey().category);
  readonly questions = computed(() => this.survey().questions);
  readonly nextQuestionId = signal(2);
  readonly isPublishing = signal(false);
  readonly minimumEndDate = getTomorrowIsoDate();
  readonly hasAttemptedPublish = signal(false);
  readonly validationState = signal<SurveyValidationState>(createValidationState());
  readonly validationMessage = signal<string | null>(null);
  readonly publishError = signal<string | null>(null);
  readonly lastPublishedSurveyId = signal<number | null>(null);
  readonly isPublishOverlayVisible = signal(false);

  toggleCategoryDropdown(): void {
    this.isCategoryDropdownOpen.update((isOpen) => !isOpen);
  }

  updateTitle(event: Event): void {
    const title = (event.target as HTMLInputElement).value;
    this.survey.update((survey) => ({ ...survey, title }));
    this.refreshValidationStateIfNeeded();
  }

  clearTitle(): void {
    this.survey.update((survey) => ({ ...survey, title: '' }));
    this.refreshValidationStateIfNeeded();
  }

  updateEndDate(event: Event): void {
    const endDate = (event.target as HTMLInputElement).value;

    if (!endDate || endDate >= this.minimumEndDate) {
      this.survey.update((survey) => ({ ...survey, endDate }));
      return;
    }

    this.survey.update((survey) => ({ ...survey, endDate: '' }));
  }

  clearEndDate(): void {
    this.survey.update((survey) => ({ ...survey, endDate: '' }));
  }

  selectCategory(category: string): void {
    this.survey.update((survey) => ({ ...survey, category }));
    this.isCategoryDropdownOpen.set(false);
  }

  clearCategory(): void {
    this.survey.update((survey) => ({ ...survey, category: null }));
  }

  updateDescription(event: Event): void {
    const description = (event.target as HTMLTextAreaElement).value;
    this.survey.update((survey) => ({ ...survey, description }));
  }

  clearDescription(): void {
    this.survey.update((survey) => ({ ...survey, description: '' }));
  }

  addQuestion(): void {
    const nextId = this.nextQuestionId();

    this.survey.update((survey) => ({
      ...survey,
      questions: [...survey.questions, createSurveyQuestion(nextId)],
    }));
    this.nextQuestionId.set(nextId + 1);
    this.refreshValidationStateIfNeeded();
  }

  updateQuestion(updatedQuestion: SurveyQuestion): void {
    this.survey.update((survey) => ({
      ...survey,
      questions: survey.questions.map((question) =>
        question.id === updatedQuestion.id ? updatedQuestion : question,
      ),
    }));
    this.refreshValidationStateIfNeeded();
  }

  deleteQuestion(questionId: number): void {
    this.survey.update((survey) => ({
      ...survey,
      questions: survey.questions.filter((question) => question.id !== questionId),
    }));
    this.refreshValidationStateIfNeeded();
  }

  async publishSurvey(): Promise<void> {
    if (this.isPublishing()) {
      return;
    }

    this.hasAttemptedPublish.set(true);
    const isValid = this.refreshValidationState();

    if (!isValid) {
      this.isPublishOverlayVisible.set(false);
      this.lastPublishedSurveyId.set(null);
      this.publishError.set(null);
      this.validationMessage.set('Please complete the highlighted required fields.');
      return;
    }

    const survey = this.survey();
    const title = survey.title.trim();

    this.isPublishing.set(true);
    this.validationMessage.set(null);
    this.publishError.set(null);
    this.isPublishOverlayVisible.set(false);
    this.lastPublishedSurveyId.set(null);

    try {
      const surveyId = await this.supabaseService.createSurvey({
        title,
        description: survey.description.trim(),
        category: survey.category ?? '',
        end_date: survey.endDate || null,
      });

      const createdQuestions = await this.supabaseService.createQuestionsForSurvey(surveyId, survey.questions);
      await this.supabaseService.createAnswersForQuestions(createdQuestions, survey.questions);

      this.lastPublishedSurveyId.set(surveyId);
      this.isPublishOverlayVisible.set(true);
    } catch (error: unknown) {
      this.publishError.set(error instanceof Error ? error.message : 'Unbekannter Fehler beim Speichern.');
    } finally {
      this.isPublishing.set(false);
    }
  }

  async openPublishedSurvey(): Promise<void> {
    const surveyId = this.lastPublishedSurveyId();

    if (!surveyId) {
      return;
    }

    this.isPublishOverlayVisible.set(false);
    await this.router.navigate(['/ballot', surveyId]);
  }

  isTitleInvalid(): boolean {
    return this.validationState().title;
  }

  isQuestionInvalid(questionId: number): boolean {
    return this.validationState().questionIds.includes(questionId);
  }

  getInvalidAnswerIndexes(questionId: number): number[] {
    return this.validationState()
      .answerKeys
      .filter((answerKey) => answerKey.startsWith(`${questionId}:`))
      .map((answerKey) => Number(answerKey.split(':')[1]));
  }

  private refreshValidationStateIfNeeded(): void {
    if (!this.hasAttemptedPublish()) {
      return;
    }

    const isValid = this.refreshValidationState();
    this.validationMessage.set(isValid ? null : 'Please complete the highlighted required fields.');
  }

  private refreshValidationState(): boolean {
    const survey = this.survey();
    const questionIds: number[] = [];
    const answerKeys: string[] = [];
    const titleInvalid = survey.title.trim().length === 0;

    for (const question of survey.questions) {
      if (question.prompt.trim().length === 0) {
        questionIds.push(question.id);
      }

      question.answers.forEach((answer, index) => {
        if (answer.trim().length === 0) {
          answerKeys.push(`${question.id}:${index}`);
        }
      });
    }

    this.validationState.set({
      title: titleInvalid,
      questionIds,
      answerKeys,
    });

    return !titleInvalid && questionIds.length === 0 && answerKeys.length === 0;
  }
}
