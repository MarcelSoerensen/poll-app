export interface SurveyQuestion {
  id: number;
  prompt: string;
  allowMultipleAnswers: boolean;
  answers: string[];
}

export function createSurveyQuestion(id: number): SurveyQuestion {
  return {
    id,
    prompt: '',
    allowMultipleAnswers: false,
    answers: ['', ''],
  };
}
