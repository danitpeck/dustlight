import { describe, it, expect } from 'vitest';
import { createJumpState, updateJump } from '../game/systems/jump';
import { MOVE } from '../game/data/constants';

describe('Jump state machine', () => {
    it('starts with all timers at zero', () => {
        const state = createJumpState();
        expect(state.coyoteTimer).toBe(0);
        expect(state.jumpBufferTimer).toBe(0);
        expect(state.isJumping).toBe(false);
        expect(state.jumpWasDown).toBe(false);
    });

    it('grants coyote time while on ground', () => {
        const state = createJumpState();
        const result = updateJump(state, {
            onGround: true, jumpHeld: false, velocityY: 0, delta: 16,
        });

        expect(result.state.coyoteTimer).toBe(MOVE.COYOTE_MS);
    });

    it('coyote timer counts down while airborne', () => {
        let state = createJumpState();

        // Stand on ground to fill coyote timer
        state = updateJump(state, {
            onGround: true, jumpHeld: false, velocityY: 0, delta: 16,
        }).state;

        // Walk off ledge
        const result = updateJump(state, {
            onGround: false, jumpHeld: false, velocityY: 50, delta: 30,
        });

        expect(result.state.coyoteTimer).toBe(MOVE.COYOTE_MS - 30);
    });

    it('buffers a jump press', () => {
        const state = createJumpState();
        const result = updateJump(state, {
            onGround: false, jumpHeld: true, velocityY: 50, delta: 16,
        });

        expect(result.state.jumpBufferTimer).toBe(MOVE.BUFFER_MS);
    });

    it('executes jump when coyote + buffer overlap', () => {
        let state = createJumpState();

        // On ground — coyote timer fills
        state = updateJump(state, {
            onGround: true, jumpHeld: false, velocityY: 0, delta: 16,
        }).state;

        // Press jump — buffer fills, coyote still valid → jump!
        const result = updateJump(state, {
            onGround: true, jumpHeld: true, velocityY: 0, delta: 16,
        });

        expect(result.newVelocityY).toBe(MOVE.JUMP_VEL);
        expect(result.state.isJumping).toBe(true);
        expect(result.state.coyoteTimer).toBe(0); // consumed
        expect(result.state.jumpBufferTimer).toBe(0); // consumed
    });

    it('allows coyote jump after walking off a ledge', () => {
        let state = createJumpState();

        // On ground
        state = updateJump(state, {
            onGround: true, jumpHeld: false, velocityY: 0, delta: 16,
        }).state;

        // Walk off — airborne for a bit, but within coyote window
        state = updateJump(state, {
            onGround: false, jumpHeld: false, velocityY: 50, delta: 20,
        }).state;

        // Press jump — still within coyote time!
        const result = updateJump(state, {
            onGround: false, jumpHeld: true, velocityY: 50, delta: 16,
        });

        expect(result.newVelocityY).toBe(MOVE.JUMP_VEL);
        expect(result.state.isJumping).toBe(true);
    });

    it('denies coyote jump after window expires', () => {
        let state = createJumpState();

        // On ground
        state = updateJump(state, {
            onGround: true, jumpHeld: false, velocityY: 0, delta: 16,
        }).state;

        // Airborne for longer than coyote window
        state = updateJump(state, {
            onGround: false, jumpHeld: false, velocityY: 50, delta: MOVE.COYOTE_MS + 10,
        }).state;

        // Press jump — too late!
        const result = updateJump(state, {
            onGround: false, jumpHeld: true, velocityY: 50, delta: 16,
        });

        expect(result.newVelocityY).toBeNull();
        expect(result.state.isJumping).toBe(false);
    });

    it('allows buffered jump on landing', () => {
        let state = createJumpState();

        // Airborne, press jump early (buffer)
        state = updateJump(state, {
            onGround: false, jumpHeld: true, velocityY: 100, delta: 16,
        }).state;
        expect(state.jumpBufferTimer).toBe(MOVE.BUFFER_MS);

        // Release jump (edge detect requires re-press for next frame)
        state = updateJump(state, {
            onGround: false, jumpHeld: false, velocityY: 100, delta: 16,
        }).state;

        // Land — buffer still valid → jump!
        const result = updateJump(state, {
            onGround: true, jumpHeld: false, velocityY: 0, delta: 16,
        });

        expect(result.newVelocityY).toBe(MOVE.JUMP_VEL);
    });

    it('denies buffered jump after buffer expires', () => {
        let state = createJumpState();

        // Press jump in air
        state = updateJump(state, {
            onGround: false, jumpHeld: true, velocityY: 100, delta: 16,
        }).state;

        // Release
        state = updateJump(state, {
            onGround: false, jumpHeld: false, velocityY: 100, delta: MOVE.BUFFER_MS + 10,
        }).state;

        // Land — buffer expired
        const result = updateJump(state, {
            onGround: true, jumpHeld: false, velocityY: 0, delta: 16,
        });

        expect(result.newVelocityY).toBeNull();
    });

    it('cuts jump height on early release (variable jump)', () => {
        let state = createJumpState();

        // On ground, press jump
        state = updateJump(state, {
            onGround: true, jumpHeld: false, velocityY: 0, delta: 16,
        }).state;
        const result1 = updateJump(state, {
            onGround: true, jumpHeld: true, velocityY: 0, delta: 16,
        });
        state = result1.state;

        // Airborne, still holding — no cut
        const result2 = updateJump(state, {
            onGround: false, jumpHeld: true, velocityY: MOVE.JUMP_VEL, delta: 16,
        });
        expect(result2.newVelocityY).toBeNull(); // no change, still ascending

        // Release early while ascending — cut!
        const result3 = updateJump(result2.state, {
            onGround: false, jumpHeld: false, velocityY: MOVE.JUMP_VEL, delta: 16,
        });
        expect(result3.newVelocityY).toBe(MOVE.JUMP_VEL * MOVE.JUMP_CUT);
        expect(result3.state.isJumping).toBe(false);
    });

    it('does not cut when already falling', () => {
        let state = createJumpState();

        // Jump
        state = updateJump(state, {
            onGround: true, jumpHeld: false, velocityY: 0, delta: 16,
        }).state;
        state = updateJump(state, {
            onGround: true, jumpHeld: true, velocityY: 0, delta: 16,
        }).state;

        // Ascending → now past apex, falling (positive velocityY)
        state = { ...state, isJumping: true };
        const result = updateJump(state, {
            onGround: false, jumpHeld: false, velocityY: 50, delta: 16,
        });

        // velocityY > 0, so jump cut should NOT apply
        expect(result.newVelocityY).toBeNull();
    });
});
