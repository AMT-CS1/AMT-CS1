import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Metrics
const successfulSubmissions = new Counter('successful_submissions');
const failedSubmissions = new Counter('failed_submissions');
const attemptDuration = new Trend('attempt_eval_duration');
const submissionSuccessRate = new Rate('submission_success_rate');

// Test Configuration Options
export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Warm up with 50 students
    { duration: '1m30s', target: 250 }, // Ramp up to 250 students
    { duration: '3m', target: 500 },   // Peak load: 500 concurrent students
    { duration: '1m', target: 0 },     // Ramp down to 0
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],       // Under 5% HTTP errors (including 429 rate limits)
    http_req_duration: ['p(95)<3500'],    // 95% of submissions completed within 3.5s
    submission_success_rate: ['rate>0.90'], // >90% code evaluations passing tests
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8000';

// Sample DAP homework submissions
const DAP_SUBMISSIONS = [
  {
    task_ref: 'swap-variables',
    content: `program SwapVariables
dictionary
    x, y, temp : integer
algorithm
    read x
    read y
    temp <- x
    x <- y
    y <- temp
    write x
    write y
endprogram`,
  },
  {
    task_ref: 'factorial',
    content: `program Factorial
dictionary
    n, fact, i : integer
algorithm
    read n
    fact <- 1
    i <- 1
    while i <= n do
        fact <- fact * i
        i <- i + 1
    endwhile
    write fact
endprogram`,
  },
  {
    task_ref: 'even-odd',
    content: `program EvenOddChecker
dictionary
    n, result : integer
algorithm
    read n
    if n % 2 == 0 then
        result <- 1
    else
        result <- 0
    endif
    write result
endprogram`,
  },
];

// 1. Setup Phase: Obtain JWT authentication token before VU execution
export function setup() {
  const loginUrl = `${BASE_URL}/auth/token`;
  const payload = {
    username: 'student_user',
    password: 'studentpass',
  };

  const params = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };

  const response = http.post(loginUrl, payload, params);
  
  if (response.status !== 200) {
    console.error(`Login failed during setup! Status: ${response.status}. Body: ${response.body}`);
    return { token: null };
  }

  const data = JSON.parse(response.body);
  console.log('Successfully logged in demo student for k6 stress test.');
  return { token: data.access_token };
}

// 2. Main Virtual User (VU) Execution Loop
export default function (data) {
  if (!data.token) {
    console.error('No authorization token available. Skipping test iteration.');
    sleep(1);
    return;
  }

  group('Student Homework Submission Workflow', function () {
    // Select random DAP submission from sample list
    const submission = DAP_SUBMISSIONS[Math.floor(Math.random() * DAP_SUBMISSIONS.length)];

    const url = `${BASE_URL}/attempts`;
    const body = JSON.stringify({
      task_ref: submission.task_ref,
      content: submission.content,
      source: 'k6_stress_test',
      confidence_level: 4.5,
    });

    // Simulate distinct student device IPs per Virtual User (__VU)
    const vuIp = `10.0.${Math.floor(__VU / 256)}.${__VU % 256}`;

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.token}`,
        'X-Forwarded-For': vuIp,
      },
    };

    const startTime = new Date();
    const res = http.post(url, body, params);
    const duration = new Date() - startTime;

    attemptDuration.add(duration);

    const isSuccess = check(res, {
      'status is 201 Created': (r) => r.status === 201,
      'has valid attempt object': (r) => {
        try {
          const json = JSON.parse(r.body);
          return json.attempt && json.attempt.id !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    if (isSuccess) {
      successfulSubmissions.add(1);
      submissionSuccessRate.add(1);
    } else {
      failedSubmissions.add(1);
      submissionSuccessRate.add(0);
      if (res.status === 429) {
        console.warn(`[HTTP 429] Rate limit hit under current load.`);
      } else {
        console.error(`[HTTP ${res.status}] Submission failed: ${res.body}`);
      }
    }

    // Realistic student pause: wait 5 to 15 seconds before next code edit & submit
    sleep(Math.floor(Math.random() * 10) + 5);
  });
}
