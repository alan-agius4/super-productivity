import {ChangeDetectionStrategy, Component, EventEmitter, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {TaskCopy} from '../../tasks/task.model';
import {ProjectService} from '../../project/project.service';
import {Subscription} from 'rxjs';
import {WorkStartEnd} from '../../project/project.model';
import {WORKLOG_EXPORT_DEFAULTS} from '../../project/project.const';
import {getWorklogStr} from '../../../util/get-work-log-str';
import * as moment from 'moment';
import 'moment-duration-format';
import {unique} from '../../../util/unique';
import {msToString} from '../../../ui/duration/ms-to-string.pipe';
import {msToClockString} from '../../../ui/duration/ms-to-clock-string.pipe';
import {roundTime} from '../../../util/round-time';
import {roundDuration} from '../../../util/round-duration';
import Clipboard from 'clipboard';
import {SnackService} from '../../../core/snack/snack.service';
import {WorklogService} from '../worklog.service';
import {WorklogExportSettingsCopy, WorklogGrouping, WorklogTask} from '../worklog.model';
import {T} from '../../../t.const';

const LINE_SEPARATOR = '\n';
const EMPTY_VAL = ' - ';

interface TaskWithParentTitle extends TaskCopy {
  parentTitle?: string;
}

interface RowItem {
  dates: string[];
  workStart: number;
  workEnd: number;
  timeSpent: number;
  timeEstimate: number;
  tasks: TaskWithParentTitle[];
  titles?: string[];
  titlesWithSub?: string[];
}

@Component({
  selector: 'worklog-export',
  templateUrl: './worklog-export.component.html',
  styleUrls: ['./worklog-export.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorklogExportComponent implements OnInit, OnDestroy {
  @Input() rangeStart: Date;
  @Input() rangeEnd: Date;
  @Input() isWorklogExport: boolean;
  @Input() isShowClose: boolean;

  @Output() cancel = new EventEmitter();

  T = T;
  isShowAsText = false;
  headlineCols: string[] = [];
  formattedRows: (string | number)[][];
  options: WorklogExportSettingsCopy = {
    ...WORKLOG_EXPORT_DEFAULTS,
    cols: [...WORKLOG_EXPORT_DEFAULTS.cols],
  };
  txt: string;
  fileName = 'tasks.csv';
  roundTimeOptions = [
    {id: 'QUARTER', title: T.F.WORKLOG.EXPORT.O.FULL_QUARTERS},
    {id: 'HALF', title: T.F.WORKLOG.EXPORT.O.FULL_HALF_HOURS},
    {id: 'HOUR', title: T.F.WORKLOG.EXPORT.O.FULL_HOURS},
  ];

  colOpts = [
    {id: 'DATE', title: T.F.WORKLOG.EXPORT.O.DATE},
    {id: 'START', title: T.F.WORKLOG.EXPORT.O.STARTED_WORKING},
    {id: 'END', title: T.F.WORKLOG.EXPORT.O.ENDED_WORKING},
    {id: 'TITLES', title: T.F.WORKLOG.EXPORT.O.PARENT_TASK_TITLES_ONLY},
    {id: 'TITLES_INCLUDING_SUB', title: T.F.WORKLOG.EXPORT.O.TITLES_AND_SUB_TASK_TITLES},
    {id: 'TIME_MS', title: T.F.WORKLOG.EXPORT.O.TIME_AS_MILLISECONDS},
    {id: 'TIME_STR', title: T.F.WORKLOG.EXPORT.O.TIME_AS_STRING},
    {id: 'TIME_CLOCK', title: T.F.WORKLOG.EXPORT.O.TIME_AS_CLOCK},
    {id: 'ESTIMATE_MS', title: T.F.WORKLOG.EXPORT.O.ESTIMATE_AS_MILLISECONDS},
    {id: 'ESTIMATE_STR', title: T.F.WORKLOG.EXPORT.O.ESTIMATE_AS_STRING},
    {id: 'ESTIMATE_CLOCK', title: T.F.WORKLOG.EXPORT.O.ESTIMATE_AS_CLOCK},
  ];

  groupByOptions = [
    {id: WorklogGrouping.DATE, title: T.F.WORKLOG.EXPORT.O.DATE},
    {id: WorklogGrouping.TASK, title: T.F.WORKLOG.EXPORT.O.TASK_SUBTASK},
    {id: WorklogGrouping.PARENT, title: T.F.WORKLOG.EXPORT.O.PARENT_TASK},
    {id: WorklogGrouping.WORKLOG, title: T.F.WORKLOG.EXPORT.O.WORKLOG}
  ];

  private _subs: Subscription = new Subscription();

  constructor(
    private _projectService: ProjectService,
    private _snackService: SnackService,
    private _worklogService: WorklogService,
  ) {
  }

  ngOnInit() {
    if (this.rangeStart && this.rangeEnd) {
      this.fileName
        = 'tasks'
        + getWorklogStr(this.rangeStart)
        + '-'
        + getWorklogStr(this.rangeEnd)
        + '.csv'
      ;
    }

    this._subs.add(this._projectService.currentProject$.subscribe((pr) => {
      if (pr.advancedCfg.worklogExportSettings) {
        this.options = {
          ...WORKLOG_EXPORT_DEFAULTS,
          ...pr.advancedCfg.worklogExportSettings,
          // NOTE: if we don't do this typescript(?) get's aggressive
          cols: [...(
            pr.advancedCfg.worklogExportSettings
              ? [...pr.advancedCfg.worklogExportSettings.cols]
              : [...WORKLOG_EXPORT_DEFAULTS.cols]
          )]
        };
      } else {
        this.options = {
          ...WORKLOG_EXPORT_DEFAULTS,
          cols: [...WORKLOG_EXPORT_DEFAULTS.cols],
        };
      }

      const tasks: WorklogTask[] = this._worklogService.getTaskListForRange(this.rangeStart, this.rangeEnd, true);

      if (tasks) {
        const rows = this._createRows(tasks, pr.workStart, pr.workEnd, this.options.groupBy);
        this.formattedRows = this._formatRows(rows);
        // TODO format to csv

        this.headlineCols = this.options.cols.map(col => {
          switch (col) {
            case 'DATE':
              return 'Date';
            case 'START':
              return 'Start';
            case 'END':
              return 'End';
            case 'TITLES':
              return 'Titles';
            case 'TITLES_INCLUDING_SUB':
              return 'Titles';
            case 'TIME_MS':
            case 'TIME_STR':
            case 'TIME_CLOCK':
              return 'Worked';
            case 'ESTIMATE_MS':
            case 'ESTIMATE_STR':
            case 'ESTIMATE_CLOCK':
              return 'Estimate';
          }
        });

        this.txt = this._formatText(this.headlineCols, this.formattedRows);
      }
    }));

    // dirty but good enough for now
    const clipboard = new Clipboard('#clipboard-btn');
    clipboard.on('success', (e: any) => {
      this._snackService.open({
        msg: T.GLOBAL_SNACK.COPY_TO_CLIPPBOARD,
        type: 'SUCCESS'
      });
      e.clearSelection();
    });
  }

  ngOnDestroy() {
    this._subs.unsubscribe();
  }

  onCancelClick() {
    this.cancel.emit();
  }

  onOptionsChange() {
    this.options.cols = this.options.cols.filter(col => !!col);
    this._projectService.updateWorklogExportSettings(this._projectService.currentId, this.options);
  }

  addCol() {
    this.options.cols.push('EMPTY');
  }

  private _createRows(tasks: WorklogTask[], startTimes: WorkStartEnd, endTimes: WorkStartEnd, groupBy: WorklogGrouping): RowItem[] {

    const _mapToGroups = (task: WorklogTask) => {
      const taskGroups: { [key: string]: RowItem } = {};
      const createEmptyGroup = () => {
        return {
          dates: [],
          timeSpent: 0,
          timeEstimate: 0,
          tasks: [],
          titlesWithSub: [],
          titles: [],
          workStart: undefined,
          workEnd: undefined,
        };
      };

      // If we're grouping by parent task ignore subtasks
      // If we're grouping by task ignore parent tasks
      if ((groupBy === WorklogGrouping.PARENT && task.parentId !== null)
        || (groupBy === WorklogGrouping.TASK && task.subTaskIds.length > 0)
      ) {
        return taskGroups;
      }

      switch (groupBy) {
        case WorklogGrouping.DATE:
          if (!task.timeSpentOnDay) {
            return {};
          }
          const numDays = Object.keys(task.timeSpentOnDay).length;
          Object.keys(task.timeSpentOnDay).forEach(day => {
            taskGroups[day] = {
              dates: [day],
              tasks: [task],
              workStart: startTimes[day],
              workEnd: endTimes[day],
              timeSpent: 0,
              timeEstimate: 0
            };
            if (!task.subTaskIds || task.subTaskIds.length === 0) {
              taskGroups[day].timeSpent = task.timeSpentOnDay[day];
              taskGroups[day].timeEstimate = task.timeEstimate / numDays;
            }
          });
          break;
        case WorklogGrouping.PARENT:
        case WorklogGrouping.TASK:
          taskGroups[task.id] = createEmptyGroup();
          taskGroups[task.id].tasks = [task];
          taskGroups[task.id].dates = Object.keys(task.timeSpentOnDay);
          taskGroups[task.id].timeEstimate = task.timeEstimate;
          taskGroups[task.id].timeSpent = Object.values(task.timeSpentOnDay).reduce((acc, curr) => acc + curr, 0);
          break;
        default: // group by work log (don't group at all)
          Object.keys(task.timeSpentOnDay).forEach(day => {
            const groupKey = task.id + '_' + day;
            taskGroups[groupKey] = createEmptyGroup();
            taskGroups[groupKey].tasks = [task];
            taskGroups[groupKey].dates = [day];
            taskGroups[groupKey].workStart = startTimes[day];
            taskGroups[groupKey].workEnd = endTimes[day];
            taskGroups[groupKey].timeEstimate = task.subTaskIds.length > 0 ? 0 : task.timeEstimate;
            taskGroups[groupKey].timeSpent = task.subTaskIds.length > 0 ? 0 : task.timeSpentOnDay[day];
          });
      }
      return taskGroups;
    };

    const groups: { [key: string]: RowItem } = {};

    tasks.forEach((task: WorklogTask) => {
      const taskGroups = _mapToGroups(task);
      Object.keys(taskGroups).forEach(groupKey => {
        if (groups[groupKey]) {
          groups[groupKey].tasks.push(...taskGroups[groupKey].tasks);
          groups[groupKey].dates.push(...taskGroups[groupKey].dates);
          if (taskGroups[groupKey].workStart !== undefined) {
            groups[groupKey].workStart = Math.min(groups[groupKey].workStart, taskGroups[groupKey].workStart);
          }
          if (taskGroups[groupKey].workEnd !== undefined) {
            groups[groupKey].workEnd = Math.min(groups[groupKey].workEnd, taskGroups[groupKey].workEnd);
          }
          groups[groupKey].timeEstimate += taskGroups[groupKey].timeEstimate;
          groups[groupKey].timeSpent += taskGroups[groupKey].timeSpent;
        } else {
          groups[groupKey] = taskGroups[groupKey];
        }
      });

    });

    const rows: RowItem[] = [];
    Object.keys(groups).sort().forEach((key => {
      const group = groups[key];

      group.titlesWithSub = unique(group.tasks.map(t => t.title));
      group.titles = unique(group.tasks.map(t => (
          t.parentId && tasks.find(ptIN => ptIN.id === t.parentId).title
        ) || (!t.parentId && t.title)
      )).filter(title => !!title);
      group.dates = unique(group.dates).sort((a: string, b: string) => {
        const dateA: number = new Date(a).getTime();
        const dateB: number = new Date(b).getTime();
        if (dateA === dateB) {
          return 0;
        } else if (dateA < dateB) {
          return -1;
        }
        return 1;
      });

      rows.push(group);
    }));

    return rows;

  }

  private _formatRows(rows: RowItem[]): (string | number)[][] {
    return rows.map(row => {
      return this.options.cols.map(col => {
        if (!col) {
          return;
        }
        const timeSpent = (this.options.roundWorkTimeTo)
          ? roundDuration(row.timeSpent, this.options.roundWorkTimeTo, true).asMilliseconds()
          : row.timeSpent;

        // If we're exporting raw worklogs, spread estimated time over worklogs belonging to a task based on
        // its share in time spent on the task
        let timeEstimate = row.timeEstimate;
        if (this.options.groupBy === WorklogGrouping.WORKLOG
          && (col === 'ESTIMATE_MS' || col === 'ESTIMATE_STR' || col === 'ESTIMATE_CLOCK')) {
          const timeSpentTotal = Object.values(row.tasks[0].timeSpentOnDay).reduce((acc, curr) => acc + curr, 0);
          const timeSpentPart = row.timeSpent / timeSpentTotal;
          console.log(`${row.timeSpent} / ${timeSpentTotal} = ${timeSpentPart}`);
          timeEstimate = timeEstimate * timeSpentPart;
        }


        switch (col) {
          case 'DATE':
            if (row.dates.length > 1) {
              return row.dates[0] + ' - ' + row.dates[row.dates.length - 1];
            }
            return row.dates[0];
          case 'START':
            const workStart = !row.workStart ? 0 : row.workStart;
            return (workStart)
              ? moment(
                (this.options.roundStartTimeTo)
                  ? roundTime(workStart, this.options.roundStartTimeTo)
                  : workStart
              ).format('HH:mm')
              : EMPTY_VAL;
          case 'END':
            return (row.workEnd)
              ? moment(
                (this.options.roundEndTimeTo && row.workEnd)
                  ? roundTime(row.workEnd, this.options.roundEndTimeTo)
                  : row.workEnd
              ).format('HH:mm')
              : EMPTY_VAL;
          case 'TITLES':
            return row.titles.join(
              this.options.separateTasksBy || '<br>');
          case 'TITLES_INCLUDING_SUB':
            return row.titlesWithSub.join(this.options.separateTasksBy || '<br>');
          case 'TIME_MS':
            return timeSpent;
          case 'TIME_STR':
            return msToString(timeSpent);
          case 'TIME_CLOCK':
            return msToClockString(timeSpent);
          case 'ESTIMATE_MS':
            return timeEstimate;
          case 'ESTIMATE_STR':
            return msToString(timeEstimate);
          case 'ESTIMATE_CLOCK':
            return msToClockString(timeEstimate);
          default:
            return EMPTY_VAL;
        }
      });
    });
  }

  private _formatText(headlineCols: string[], rows: (string | number)[][]): string {
    let txt = '';
    txt += headlineCols.join(';') + LINE_SEPARATOR;
    txt += rows.map(cols => cols.join(';')).join(LINE_SEPARATOR);
    return txt;
  }
}
