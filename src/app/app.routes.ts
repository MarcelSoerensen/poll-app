import { Routes } from '@angular/router';
import { MainPage } from './main-page/main-page';
import { CreateSurvey } from './create-survey/create-survey';
import { Ballot } from './ballot/ballot';
import { PrivacyPolicy } from './privacy-policy/privacy-policy';
import { Imprint } from './imprint/imprint';


export const routes: Routes = [
    {path: '', redirectTo: 'main-page', pathMatch: 'full'},
    {path: 'main-page', component: MainPage},
    {path: 'create-survey', component: CreateSurvey},
    {path: 'ballot', component: Ballot},
    {path: 'privacy-policy', component: PrivacyPolicy},
    {path: 'imprint', component: Imprint},
];


