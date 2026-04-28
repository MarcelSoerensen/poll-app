import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { createSurveyQuestion, type SurveyQuestion } from './question-item.model';

@Component({
  selector: 'app-question-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './question-item.html',
  styleUrl: './question-item.scss',
})
export class QuestionItem {
  readonly question = input.required<SurveyQuestion>();
  readonly questionNumber = input.required<number>();
  readonly questionInvalid = input(false);
  readonly invalidAnswerIndexes = input<number[]>([]);

  readonly questionUpdated = output<SurveyQuestion>();
  readonly questionDeleted = output<number>();

  readonly maxAnswers = 6;

  isAnswerInvalid(index: number): boolean {
    return this.invalidAnswerIndexes().includes(index);
  }

  getAnswerLabel(index: number): string {
    return String.fromCharCode(65 + index) + '.';
  }

  updatePrompt(event: Event): void {
    const prompt = (event.target as HTMLInputElement).value;
    this.questionUpdated.emit({ ...this.question(), prompt });
  }

  clearPrompt(): void {
    this.questionUpdated.emit({ ...this.question(), prompt: '' });
  }

  toggleMultipleAnswers(): void {
    this.questionUpdated.emit({
      ...this.question(),
      allowMultipleAnswers: !this.question().allowMultipleAnswers,
    });
  }

  updateAnswer(index: number, event: Event): void {
    const answers = [...this.question().answers];
    answers[index] = (event.target as HTMLInputElement).value;

    this.questionUpdated.emit({ ...this.question(), answers });
  }

  deleteAnswer(index: number): void {
    const answers = [...this.question().answers];

    if (answers.length <= 1) {
      answers[0] = '';
      this.questionUpdated.emit({ ...this.question(), answers });
      return;
    }

    answers.splice(index, 1);
    this.questionUpdated.emit({ ...this.question(), answers });
  }

  addAnswer(): void {
    const answers = [...this.question().answers, ''];
    this.questionUpdated.emit({ ...this.question(), answers });
  }

  deleteQuestion(): void {
    if (this.questionNumber() === 1) {
      this.questionUpdated.emit(createSurveyQuestion(this.question().id));
      return;
    }

    this.questionDeleted.emit(this.question().id);
  }
}
