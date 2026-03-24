export enum ROUTES {
  EventPage = "/event/:naddr",
  EditEventPage = "/event/edit/:naddr",
  WeekCalendar = "/w/:year/:weekNumber",
  DayCalendar = "/d/:year/:month/:day",
  MonthCalendar = "/m/:year/:monthNumber",
  Notifications = "/notifications",
}

export function getEventPage(naddr: string, viewKey?: string) {
  const urlParam = new URLSearchParams();
  if (viewKey) {
    urlParam.append("viewKey", viewKey);
  }
  return `/event/${naddr}?${urlParam.toString()}`;
}

export function getEditEventPage(naddr: string, viewKey?: string) {
  const urlParam = new URLSearchParams();
  if (viewKey) {
    urlParam.append("viewKey", viewKey);
  }
  return `/event/edit/${naddr}?${urlParam.toString()}`;
}
