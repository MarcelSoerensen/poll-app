import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SupabaseService, type SurveyRow } from '../../shared/data-access/supabase.service';

type SurveyStatus = 'active' | 'past';

interface SurveyPreview {
  id: number;
  category: string;
  title: string;
  endDate: string | null;
  status: SurveyStatus;
}

function toStartOfDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

@Component({
  selector: 'app-main-page-surveys-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './surveys-overview.html',
  styleUrl: './surveys-overview.scss',
})
export class SurveysOverview {
  private readonly supabaseService = inject(SupabaseService);

  readonly statusFilter = signal<SurveyStatus>('active');
  readonly selectedCategory = signal<string | null>(null);
  readonly isCategoryDropdownOpen = signal(false);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly surveys = signal<SurveyPreview[]>([]);

  readonly categories = computed(() =>
    [...new Set(this.surveys().map((survey) => survey.category))],
  );

  readonly endingSoonSurveys = computed(() =>
    this.surveys()
      .filter((survey) => survey.status === 'active')
      .sort((left, right) => this.compareSurveysByEndDate(left, right, 'asc'))
      .slice(0, 3),
  );

  readonly visibleSurveys = computed(() => {
    const status = this.statusFilter();
    const category = this.selectedCategory();

    return this.surveys().filter((survey) => {
      if (survey.status !== status) {
        return false;
      }

      if (category && survey.category !== category) {
        return false;
      }

      return true;
    }).sort((left, right) =>
      status === 'active'
        ? this.compareSurveysByEndDate(left, right, 'asc')
        : this.compareSurveysByEndDate(left, right, 'desc'),
    );
  });

  constructor() {
    void this.loadSurveys();
  }

  setStatusFilter(status: SurveyStatus): void {
    this.statusFilter.set(status);
  }

  toggleCategoryDropdown(): void {
    this.isCategoryDropdownOpen.update((isOpen) => !isOpen);
  }

  selectCategory(category: string): void {
    this.selectedCategory.set(category);
    this.isCategoryDropdownOpen.set(false);
  }

  clearCategory(): void {
    this.selectedCategory.set(null);
    this.isCategoryDropdownOpen.set(false);
  }

  getEndingBadgeLabel(survey: SurveyPreview): string {
    if (!survey.endDate) {
      return survey.status === 'past' ? 'Ended' : 'No deadline';
    }

    if (survey.status === 'past') {
      return 'Ended';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = toStartOfDay(survey.endDate);
    const diffInMs = endDate.getTime() - today.getTime();
    const diffInDays = Math.ceil(diffInMs / 86_400_000);

    if (diffInDays <= 0) {
      return 'Ends today';
    }

    return diffInDays === 1 ? 'Ends in 1 day' : `Ends in ${diffInDays} days`;
  }

  private async loadSurveys(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const rows = await this.supabaseService.loadSurveys();
      this.surveys.set(rows.map((row) => this.mapSurveyRow(row)));
    } catch (error: unknown) {
      this.loadError.set(error instanceof Error ? error.message : 'Unknown error while loading surveys.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private mapSurveyRow(row: SurveyRow): SurveyPreview {
    return {
      id: row.id,
      category: row.category || 'Uncategorized',
      title: row.title,
      endDate: row.end_date,
      status: this.getSurveyStatus(row.end_date),
    };
  }

  private getSurveyStatus(endDate: string | null): SurveyStatus {
    if (!endDate) {
      return 'active';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return toStartOfDay(endDate) < today ? 'past' : 'active';
  }

  private compareSurveysByEndDate(
    left: SurveyPreview,
    right: SurveyPreview,
    direction: 'asc' | 'desc',
  ): number {
    const leftValue = left.endDate ? toStartOfDay(left.endDate).getTime() : Number.POSITIVE_INFINITY;
    const rightValue = right.endDate ? toStartOfDay(right.endDate).getTime() : Number.POSITIVE_INFINITY;

    return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  }
}
