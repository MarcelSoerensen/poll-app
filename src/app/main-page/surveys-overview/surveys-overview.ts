import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

type SurveyStatus = 'active' | 'past';

interface SurveyPreview {
  id: number;
  category: string;
  title: string;
  endsIn: string;
  status: SurveyStatus;
}

@Component({
  selector: 'app-main-page-surveys-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './surveys-overview.html',
  styleUrl: './surveys-overview.scss',
})
export class SurveysOverview {
  readonly statusFilter = signal<SurveyStatus>('active');
  readonly selectedCategory = signal<string | null>(null);
  readonly isCategoryDropdownOpen = signal(false);

  readonly surveys = signal<SurveyPreview[]>([
    {
      id: 1,
      category: 'Team Activities',
      title: "Let's Plan the Next Team Event Together",
      endsIn: '1 Day',
      status: 'active',
    },
    {
      id: 2,
      category: 'Health & Wellness',
      title: 'Choose the Next Office Wellness Program',
      endsIn: '3 Days',
      status: 'active',
    },
    {
      id: 3,
      category: 'Education & Learning',
      title: 'Vote for the Next Learning Workshop Topic',
      endsIn: '5 Days',
      status: 'active',
    },
    {
      id: 4,
      category: 'Technology & Innovation',
      title: 'Pick the Tooling Focus for Next Quarter',
      endsIn: 'Ended',
      status: 'past',
    },
    {
      id: 5,
      category: 'Team Activities',
      title: 'Retrospective: Team Offsite Format',
      endsIn: 'Ended',
      status: 'past',
    },
  ]);

  readonly categories = computed(() =>
    [...new Set(this.surveys().map((survey) => survey.category))],
  );

  readonly endingSoonSurveys = computed(() =>
    this.surveys()
      .filter((survey) => survey.status === 'active')
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
    });
  });

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
}
