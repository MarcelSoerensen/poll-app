import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { QuestionItem } from './question-item/question-item';
import { createSurveyQuestion, type SurveyQuestion } from './question-item/question-item.model';

interface SurveyDraft {
  title: string;
  endDate: string;
  category: string | null;
  description: string;
  questions: SurveyQuestion[];
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

@Component({
  selector: 'app-create-survey',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, QuestionItem],
  templateUrl: './create-survey.html',
  styleUrl: './create-survey.scss',
})
export class CreateSurvey {
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

  toggleCategoryDropdown(): void {
    this.isCategoryDropdownOpen.update((isOpen) => !isOpen);
  }

  updateTitle(event: Event): void {
    const title = (event.target as HTMLInputElement).value;
    this.survey.update((survey) => ({ ...survey, title }));
  }

  clearTitle(): void {
    this.survey.update((survey) => ({ ...survey, title: '' }));
  }

  updateEndDate(event: Event): void {
    const endDate = (event.target as HTMLInputElement).value;
    this.survey.update((survey) => ({ ...survey, endDate }));
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
  }

  updateQuestion(updatedQuestion: SurveyQuestion): void {
    this.survey.update((survey) => ({
      ...survey,
      questions: survey.questions.map((question) =>
        question.id === updatedQuestion.id ? updatedQuestion : question,
      ),
    }));
  }

  deleteQuestion(questionId: number): void {
    this.survey.update((survey) => ({
      ...survey,
      questions: survey.questions.filter((question) => question.id !== questionId),
    }));
  }
}
