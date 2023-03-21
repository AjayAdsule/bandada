import { ScheduleModule } from "@nestjs/schedule"
import { Test } from "@nestjs/testing"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Invite } from "../invites/entities/invite.entity"
import { InvitesService } from "../invites/invites.service"
import { Group } from "./entities/group.entity"
import { Member } from "./entities/member.entity"
import { GroupsService } from "./groups.service"

jest.mock("@zk-groups/utils", () => ({
    __esModule: true,
    getZKGroupsContract: () => ({
        updateGroups: jest.fn(() => ({
            status: true,
            logs: ["1"]
        }))
    })
}))

describe("GroupsService", () => {
    let groupsService: GroupsService
    let invitesService: InvitesService
    let groupId: string

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRootAsync({
                    useFactory: () => ({
                        type: "sqlite",
                        database: ":memory:",
                        dropSchema: true,
                        entities: [Group, Invite, Member],
                        synchronize: true
                    })
                }),
                TypeOrmModule.forFeature([Group, Invite, Member]),
                ScheduleModule.forRoot()
            ],
            providers: [GroupsService, InvitesService]
        }).compile()

        groupsService = await module.resolve(GroupsService)
        invitesService = await module.resolve(InvitesService)

        const { id } = await groupsService.createGroup(
            {
                name: "Group1",
                description: "This is a description",
                treeDepth: 16
            },
            "admin"
        )

        groupId = id
    })

    describe("# createGroup", () => {
        it("Should create a group", async () => {
            const { treeDepth, members } = await groupsService.createGroup(
                {
                    name: "Group2",
                    description: "This is a description",
                    treeDepth: 16
                },
                "admin"
            )

            expect(treeDepth).toBe(16)
            expect(members).toHaveLength(0)
        })
    })

    describe("# updateGroup", () => {
        it("Should update a group", async () => {
            const { description } = await groupsService.updateGroup(
                {
                    description: "This is a new description"
                },
                groupId,
                "admin"
            )

            expect(description).toContain("new")
        })

        it("Should not update a group if the admin is the wrong one", async () => {
            const fun = groupsService.updateGroup(
                {
                    description: "This is a new description"
                },
                groupId,
                "wrong-admin"
            )

            await expect(fun).rejects.toThrow("You are not the admin")
        })
    })

    describe("# getAllGroupsData", () => {
        it("Should return a list of groups", async () => {
            const result = await groupsService.getAllGroups()

            expect(result).toHaveLength(2)
        })
    })

    describe("# getGroupsByAdmin", () => {
        it("Should return a list of groups by admin", async () => {
            const result = await groupsService.getGroupsByAdmin("admin")

            expect(result).toHaveLength(2)
        })
    })

    describe("# getGroup", () => {
        it("Should return a group", async () => {
            const { treeDepth, members } = await groupsService.getGroup(groupId)

            expect(treeDepth).toBe(16)
            expect(members).toHaveLength(0)
        })

        it("Should throw 404 error about not exist group", async () => {
            const fun = groupsService.getGroup("Group2")

            await expect(fun).rejects.toThrow("does not exist")
        })
    })

    describe("# addMember", () => {
        let invite: Invite

        beforeAll(async () => {
            invite = await invitesService.createInvite({ groupId }, "admin")
        })

        it("Should add a member to an existing group", async () => {
            const { members } = await groupsService.addMember(
                { inviteCode: invite.code },
                groupId,
                "123123"
            )

            expect(members).toHaveLength(1)
        })

        it("Should update contract on adding member", async () => {
            const invite2 = await invitesService.createInvite(
                { groupId },
                "admin"
            )

            await groupsService.addMember(
                { inviteCode: invite2.code },
                groupId,
                "124"
            )

            expect(
                // @ts-ignore
                groupsService.zkGroupsContract.updateGroups
            ).toHaveBeenCalled()
        })

        it("Should not add any member if they already exist", async () => {
            const fun = groupsService.addMember(
                { inviteCode: invite.code },
                groupId,
                "123123"
            )

            await expect(fun).rejects.toThrow("already exists")
        })
    })

    describe("# isGroupMember", () => {
        it("Should return false if a member does not exist", () => {
            const result = groupsService.isGroupMember(groupId, "123122")

            expect(result).toBeFalsy()
        })

        it("Should return true if a member exists", () => {
            const result = groupsService.isGroupMember(groupId, "123123")

            expect(result).toBeTruthy()
        })
    })

    describe("# generateMerkleProof", () => {
        it("Should return a Merkle proof", () => {
            const merkleproof = groupsService.generateMerkleProof(
                groupId,
                "123123"
            )

            expect(merkleproof).toBeDefined()
        })

        it("Should not return any Merkle proof if the member does not exist", async () => {
            const fun = () =>
                groupsService.generateMerkleProof(groupId, "123122")

            expect(fun).toThrow("does not exist")
        })
    })
})
