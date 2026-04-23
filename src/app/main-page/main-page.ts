import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface SurveyPreview {
  id: number;
  category: string;
  title: string;
  endsIn: string;
}

@Component({
  selector: 'app-main-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './main-page.html',
  styleUrls: ['./main-page.scss'],
})
export class MainPage {
  readonly endingSoonSurveys = signal<SurveyPreview[]>([
    {
      id: 1,
      category: 'Team Activities',
      title: 'Let\'s Plan the Next Team Event Together',
      endsIn: '1 Day',
    },
    {
      id: 2,
      category: 'Health & Wellness',
      title: 'Choose the Next Office Wellness Program',
      endsIn: '3 Days',
    },
    {
      id: 3,
      category: 'Education & Learning',
      title: 'Vote for the Next Learning Workshop Topic',
      endsIn: '5 Days',
    },
  ]);

  readonly visibleEndingSoonSurveys = computed(() => this.endingSoonSurveys().slice(0, 3));
}
