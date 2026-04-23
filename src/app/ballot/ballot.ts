import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
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

interface BallotSurveyData extends SurveyData {
  id: number;
  results: QuestionResult[];
}

const BALLOT_SURVEYS: BallotSurveyData[] = [
  {
    id: 1,
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
    results: [
      { questionId: 1, answerPercentages: [27, 44, 29] },
      { questionId: 2, answerPercentages: [60, 20, 15, 5] },
      { questionId: 3, answerPercentages: [15, 35, 50] },
    ],
  },
  {
    id: 2,
    title: 'Choose the Next Office Wellness Program',
    description:
      'Help us decide which wellness offer should be introduced next by selecting the formats that would support your workday best.',
    endDate: '2026-09-03',
    category: 'Health & Wellness',
    questions: [
      {
        id: 1,
        prompt: 'Which wellness format interests you most?',
        allowMultipleAnswers: false,
        answers: ['Yoga sessions', 'Mindfulness workshops', 'Desk stretching program'],
      },
      {
        id: 2,
        prompt: 'What time works best for these sessions?',
        allowMultipleAnswers: true,
        answers: ['Before work', 'Lunch break', 'After work'],
      },
    ],
    results: [
      { questionId: 1, answerPercentages: [38, 41, 21] },
      { questionId: 2, answerPercentages: [24, 53, 23] },
    ],
  },
  {
    id: 3,
    title: 'Vote for the Next Learning Workshop Topic',
    description:
      'We are planning our next internal learning session. Vote for the topics that would help you grow most in your current role.',
    endDate: '2026-09-05',
    category: 'Education & Learning',
    questions: [
      {
        id: 1,
        prompt: 'Which topic should we cover next?',
        allowMultipleAnswers: false,
        answers: ['Presentation skills', 'Conflict management', 'Agile collaboration'],
      },
      {
        id: 2,
        prompt: 'Which learning format do you prefer?',
        allowMultipleAnswers: true,
        answers: ['Interactive workshop', 'Expert talk', 'Hands-on group exercise'],
      },
      {
        id: 3,
        prompt: 'How long should the session be?',
        allowMultipleAnswers: false,
        answers: ['60 minutes', '90 minutes', 'Half day'],
      },
    ],
    results: [
      { questionId: 1, answerPercentages: [31, 19, 50] },
      { questionId: 2, answerPercentages: [47, 18, 35] },
      { questionId: 3, answerPercentages: [22, 58, 20] },
    ],
  },
];

@Component({
  selector: 'app-ballot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './ballot.html',
  styleUrl: './ballot.scss',
})
export class Ballot {
  readonly route = inject(ActivatedRoute);
  readonly ballotSurvey = this.getBallotSurvey();
  readonly survey = signal<SurveyData>({
    title: this.ballotSurvey.title,
    description: this.ballotSurvey.description,
    endDate: this.ballotSurvey.endDate,
    category: this.ballotSurvey.category,
    questions: this.ballotSurvey.questions,
  });

  readonly results = signal<QuestionResult[]>(this.ballotSurvey.results);

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

  private getBallotSurvey(): BallotSurveyData {
    const ballotId = Number(this.route.snapshot.paramMap.get('id') ?? '1');
    return BALLOT_SURVEYS.find((survey) => survey.id === ballotId) ?? BALLOT_SURVEYS[0];
  }
}
