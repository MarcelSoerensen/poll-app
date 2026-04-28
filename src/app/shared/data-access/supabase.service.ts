import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { type SurveyQuestion } from '../../create-survey/question-item/question-item.model';

export interface SurveyRow {
  id: number;
  title: string;
  description: string;
  category: string;
  end_date: string | null;
  created_at: string;
}

interface CreateSurveyPayload {
  title: string;
  description: string;
  category: string;
  end_date: string | null;
}

interface QuestionRow {
  id: number;
  survey_id: number;
  question_order: number;
  question_text: string;
  allow_multiple_answers: boolean;
}

interface AnswerRow {
  id: number;
  question_id: number;
  answer_order: number;
  answer_text: string;
}

interface CreateQuestionPayload {
  survey_id: number;
  question_order: number;
  question_text: string;
  allow_multiple_answers: boolean;
}

interface CreateAnswerPayload {
  question_id: number;
  answer_order: number;
  answer_text: string;
}

const SUPABASE_URL = 'https://gwlfmkwbppsyvxdmefpd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RvFbEYHQ8TW62i6YKTU5Jw_Zl-JE8zG';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly client: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async loadSurveys(): Promise<SurveyRow[]> {
    this.ensureConfigured();

    const { data, error } = await this.client
      .from('surveys')
      .select('id, title, description, category, end_date, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data satisfies SurveyRow[];
  }

  async loadSurveyById(id: number): Promise<SurveyRow | null> {
    this.ensureConfigured();

    const { data, error } = await this.client
      .from('surveys')
      .select('id, title, description, category, end_date, created_at')
      .eq('id', id)
      .maybeSingle<SurveyRow>();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async loadQuestionsBySurveyId(surveyId: number): Promise<QuestionRow[]> {
    this.ensureConfigured();

    const { data, error } = await this.client
      .from('questions')
      .select('id, survey_id, question_order, question_text, allow_multiple_answers')
      .eq('survey_id', surveyId)
      .order('question_order', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data satisfies QuestionRow[];
  }

  async loadAnswersByQuestionIds(questionIds: number[]): Promise<AnswerRow[]> {
    this.ensureConfigured();

    if (questionIds.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from('answers')
      .select('id, question_id, answer_order, answer_text')
      .in('question_id', questionIds)
      .order('answer_order', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data satisfies AnswerRow[];
  }

  async createSurvey(payload: CreateSurveyPayload): Promise<number> {
    this.ensureConfigured();

    const { data, error } = await this.client
      .from('surveys')
      .insert(payload)
      .select('id')
      .single<SurveyRow>();

    if (error) {
      throw new Error(error.message);
    }

    return data.id;
  }

  async createQuestionsForSurvey(surveyId: number, questions: SurveyQuestion[]): Promise<QuestionRow[]> {
    this.ensureConfigured();

    const payload: CreateQuestionPayload[] = questions.map((question, index) => ({
      survey_id: surveyId,
      question_order: index + 1,
      question_text: question.prompt.trim(),
      allow_multiple_answers: question.allowMultipleAnswers,
    }));

    const { data, error } = await this.client
      .from('questions')
      .insert(payload)
      .select('id, survey_id, question_order, question_text, allow_multiple_answers');

    if (error) {
      throw new Error(error.message);
    }

    return data satisfies QuestionRow[];
  }

  async createAnswersForQuestions(createdQuestions: QuestionRow[], draftQuestions: SurveyQuestion[]): Promise<void> {
    this.ensureConfigured();

    const questionIdByOrder = new Map<number, number>(
      createdQuestions.map((question) => [question.question_order, question.id]),
    );

    const payload: CreateAnswerPayload[] = [];

    draftQuestions.forEach((question, questionIndex) => {
      const questionOrder = questionIndex + 1;
      const questionId = questionIdByOrder.get(questionOrder);

      if (!questionId) {
        return;
      }

      question.answers.forEach((answer, answerIndex) => {
        payload.push({
          question_id: questionId,
          answer_order: answerIndex + 1,
          answer_text: answer.trim(),
        });
      });
    });

    const { error } = await this.client.from('answers').insert(payload);

    if (error) {
      throw new Error(error.message);
    }
  }

  private ensureConfigured(): void {
    const hasPlaceholderConfig =
      SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_');

    if (hasPlaceholderConfig) {
      throw new Error(
        'Supabase ist noch nicht konfiguriert. Trage URL und Anon Key in src/app/shared/data-access/supabase.service.ts ein.',
      );
    }
  }
}