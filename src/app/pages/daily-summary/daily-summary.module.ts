import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {DailySummaryComponent} from './daily-summary.component';
import {FormsModule} from '@angular/forms';
import {UiModule} from '../../ui/ui.module';
import {GoogleModule} from '../../features/google/google.module';
import {RouterModule} from '@angular/router';
import {WorklogModule} from '../../features/worklog/worklog.module';
import {MetricModule} from '../../features/metric/metric.module';
import {TasksModule} from '../../features/tasks/tasks.module';
import { PlanTasksTomorrowComponent } from './plan-tasks-tomorrow/plan-tasks-tomorrow.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    UiModule,
    GoogleModule,
    RouterModule,
    WorklogModule,
    MetricModule,
    TasksModule,
  ],
  declarations: [
    DailySummaryComponent,
    PlanTasksTomorrowComponent,
  ],
  entryComponents: []

})
export class DailySummaryModule {
}
