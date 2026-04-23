import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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

@Component({
  selector: 'app-ballot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './ballot.html',
  styleUrl: './ballot.scss',
})
export class Ballot {
  readonly survey = signal<SurveyData>({
    title: "Let's Plan the Next Team Event Together",
    description:
      'We want to create team activities that everyone will enjoy — share your preferences and ideas in our survey to help us plan better experiences together.',
    endDate: '2026-09-01',
    category: 'Team Activities',
    questions: [
      {
        id: 1,
        prompt: 'Which date works best for you?',
        allowMultipleAnswers: false,
        answers: ['First week of October', 'Second week of October', 'End of October'],
      },
      {
        id: 2,
        prompt: 'What type of activity do you prefer?',
        allowMultipleAnswers: true,
        answers: ['Outdoor adventure', 'Team cooking class', 'Escape room', 'City tour'],
      },
      {
        id: 3,
        prompt: 'How many hours should the event last?',
        allowMultipleAnswers: false,
        answers: ['2 hours', 'Half a day', 'Full day'],
      },
    ],
  });

  readonly results = signal<QuestionResult[]>([
    { questionId: 1, answerPercentages: [27, 44, 29] },
    { questionId: 2, answerPercentages: [60, 20, 15, 5] },
    { questionId: 3, answerPercentages: [15, 35, 50] },
  ]);

  readonly selectedAnswers = signal<Map<number, Set<number>>>(new Map());

  readonly formattedEndDate = computed(() => {
    const endDate = this.survey().endDate;
    if (!endDate) return null;
    const [year, month, day] = endDate.split('-');
    return `${day}.${month}.${year}`;
  });

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
}
