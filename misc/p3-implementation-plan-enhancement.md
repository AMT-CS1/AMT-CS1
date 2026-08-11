Take a look on the student workspace page when a student solve a set of homework or practicum (checkpoint). please add a submit button if the student already finish all of the problem given and make the time stamp are appropriate not always counting when we click the review.
In teacher view, for the homework management and checkpoint management, make it possible for the teacher to manage which problems are included into a homework or a checkpoint set. there should be also option random to randomize the problem., not just based on weeks and KC tag. 
In student problems view, the homework view should be refined. So here is the business process that we want to implement:
Phase 1: Session Access and Visual State Logic
Students must log into the application to begin.
Students navigate to the dedicated homework session.
Students select the active homework assigned for a specific week, referred to as "Week-n".
The teacher provides "n" questions for designated weeks based on the schedule.
The interface must display modules using a specific color-coding system to indicate availability.
Red boxes indicate that the module is not yet opened for the student.
Green boxes indicate that the module is currently open and ready to be worked on.
Yellow boxes indicate a locked state that will only become available after the corresponding Green module is completed.
A complete weekly package consists of "N" Misconception Problems (MP) contained in a Green box and "M" Problem Solving (PS) questions contained in a Yellow box.
There will be exactly 1 MP package and 1 PS package generated per week.
Phase 2: Misconception Problem (MP) Execution
The system must enforce that students complete the MP package (Green box) before accessing anything else.
The system evaluates the number of misconceptions tied to the upcoming Problem Solving (PS) questions.
If a specific misconception applies to multiple PS questions, the system must duplicate that MP question accordingly.
For example, if PS Question 1 requires SQ-01 and VA-01, and PS Question 2 requires VA-01, VA-02, and Ex-01, the system will generate 1 SQ-01 question, 2 VA-01 questions, 1 VA-02 question, and 1 Ex-01 question.
If a student has previously answered an MP associated with the PS, the system will only serve the remaining unanswered MPs linked to that PS.
If all MPs linked to the specific PS have already been answered by the student, the system must provide a random MP instead.
The MP User Interface must display the Question Description at the top.
The MP User Interface must provide four distinct choices: Option A, Option B, Option C, and Option D.
Option D must be labeled as "Tidak Tahu" (I Don't Know) and feature a text input field.
Selecting Option D can be treated as an incorrect answer by the system, even if a correct answer exists among the other options.
The system must log all student inputs to analyze their responses using audit techniques.
Phase 3: Problem Solving (PS) Execution
After the MP package is finished, the Yellow PS module unlocks, and the student proceeds to work on it.
Use the existing UI, at the bottom of the UI, there must be a "Jelasin Pseudocode" (Explain Pseudocode) section.
This reasoning section requires the student to type out an explanation of their pseudocode in text format.



on homework page and checkpoint page, when the students do the exercises given (MP and PS), make a tab detector so that each time the students move into another tab instead the app, then there will be a pop-up warning for the students to not move into another tab or move to another app. Make sure this cheat detector is logged into the database. Update the schema for the database for this use case.

Close the checkpoint view so that students cannot access the app now. 
for history view, make the view history per homework and then inside it they can see per questions detail inside the per homework section. separate the view for MP and PS for each homework on each week. 
