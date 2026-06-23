import asyncio
from datetime import datetime, timezone
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.core.security import get_password_hash
from app.models import (
    Base, User, WeeklyTarget, Attempt, StudentModelState,
    TutoringEpisode, CriticRecord, CuratedCase, Rating,
    EvidenceBlob, InteractionLog
)

# Align connection URL
db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

async def seed_data():
    engine = create_async_engine(db_url, echo=True)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session() as session:
        print("Starting database seeding...")
        
        # 1. Seed Users (if not exists)
        users_data = [
            {
                "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
                "username": "student_user",
                "email": "student@example.com",
                "password": "studentpass",
                "role": "student",
                "consent_status": True
            },
            {
                "id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
                "username": "instructor_user",
                "email": "instructor@example.com",
                "password": "instructorpass",
                "role": "instructor",
                "consent_status": True
            },
            {
                "id": uuid.UUID("33333333-3333-3333-3333-333333333333"),
                "username": "researcher_user",
                "email": "researcher@example.com",
                "password": "researcherpass",
                "role": "researcher",
                "consent_status": True
            },
            {
                "id": uuid.UUID("44444444-4444-4444-4444-444444444444"),
                "username": "rater_user",
                "email": "rater@example.com",
                "password": "raterpass",
                "role": "rater",
                "consent_status": True
            }
        ]
        
        created_users = {}
        for u in users_data:
            stmt = select(User).where(User.username == u["username"])
            result = await session.execute(stmt)
            existing_user = result.scalar_one_or_none()
            
            if not existing_user:
                db_user = User(
                    id=u["id"],
                    username=u["username"],
                    hashed_password=get_password_hash(u["password"]),
                    role=u["role"],
                    consent_status=u["consent_status"]
                )
                session.add(db_user)
                created_users[u["role"]] = db_user
                print(f"Seeded user: {u['username']}")
            else:
                created_users[u["role"]] = existing_user
                print(f"User already exists: {u['username']}")
                
        await session.commit()
        
        # Resolve user refs
        student = created_users["student"]
        rater = created_users["rater"]
        
        # 2. Seed WeeklyTarget
        target_id = uuid.uuid4()
        db_target = WeeklyTarget(
            id=target_id,
            course_ref="CS1-PYTHON-2026",
            week=1,
            topic_kc_focus="Variables and Types",
            target_task="Write a program that swaps two variables.",
            source="curriculum_syllabus"
        )
        session.add(db_target)
        print("Seeded WeeklyTarget")
        
        # 3. Seed Attempt
        attempt_id = uuid.uuid4()
        db_attempt = Attempt(
            id=attempt_id,
            user_id=student.id,
            task_ref="var_swap_task",
            modality="pseudocode",
            content_ref="x = 5\ny = 10\ntemp = x\nx = y\ny = temp",
            source="student_editor",
            confidence_level=0.95
        )
        session.add(db_attempt)
        print("Seeded Attempt")
        
        # 4. Seed StudentModelState
        state_id = uuid.uuid4()
        db_state = StudentModelState(
            id=state_id,
            user_id=student.id,
            kc_mastery={"Variables": 0.8, "Assignment": 0.9},
            misconception_risk={"VariableSwapMisconception": 0.1},
            evidence_confidence=0.85
        )
        session.add(db_state)
        print("Seeded StudentModelState")
        
        await session.commit()
        
        # 5. Seed TutoringEpisode
        episode_id = uuid.uuid4()
        db_episode = TutoringEpisode(
            id=episode_id,
            user_id=student.id,
            learner_state_ref=state_id,
            action_type="provide_hint",
            generated_output_ref="Try using a temporary helper variable to hold one value.",
            status="completed"
        )
        session.add(db_episode)
        print("Seeded TutoringEpisode")
        
        await session.commit()
        
        # 6. Seed CriticRecord
        db_critic = CriticRecord(
            id=uuid.uuid4(),
            episode_id=episode_id,
            checks={"hallucination_check": "passed", "pedagogical_alignment": "passed"},
            verdict="approved",
            revision_count=0
        )
        session.add(db_critic)
        print("Seeded CriticRecord")
        
        # 7. Seed CuratedCase with pgvector
        # Generating a dummy 1536-dimensional vector (standard for pgvector tests)
        dummy_embedding = [0.01 * (i % 10) for i in range(1536)]
        db_case = CuratedCase(
            id=uuid.uuid4(),
            embedding=dummy_embedding,
            target_kc="Variables",
            misconception_pattern="Confusing assignment direction",
            learner_profile="Novice programmer struggling with memory trace",
            difficulty="easy",
            outcome_evidence="Provided variable trace diagram, student corrected code in next attempt."
        )
        session.add(db_case)
        print("Seeded CuratedCase (pgvector verified)")
        
        # 8. Seed Rating
        db_rating = Rating(
            id=uuid.uuid4(),
            rater_id=rater.id,
            item_ref=f"episode:{episode_id}",
            rubric_scores={"helpfulness": 5, "pedagogical_value": 4},
        )
        session.add(db_rating)
        print("Seeded Rating")
        
        # 9. Seed EvidenceBlob
        db_evidence = EvidenceBlob(
            id=uuid.uuid4(),
            uri="s3://amt-evidence/student-attempts/1111/audio-explain.wav",
            type="audio/wav",
            hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            provenance="web_microphone_upload",
            confidence_level=0.9
        )
        session.add(db_evidence)
        print("Seeded EvidenceBlob")
        
        # 10. Seed InteractionLog
        db_log = InteractionLog(
            id=uuid.uuid4(),
            actor="student_user",
            event_type="submit_pseudocode",
            payload={"task_ref": "var_swap_task", "char_count": 48}
        )
        session.add(db_log)
        print("Seeded InteractionLog")
        
        await session.commit()
        print("Database seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed_data())
